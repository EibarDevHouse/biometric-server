import { NextRequest, NextResponse } from "next/server";
import { parseBody, buildResponse, toDeviceTime } from "@/lib/protocol";
import {
  runAsync,
  getAsync,
  allAsync,
} from "@/lib/db";
import { logRawTraffic } from "./index";

const NO_CMD_STRATEGY = process.env.NO_CMD_STRATEGY || "ok_empty";

export async function handleReceiveCmd(
  request: NextRequest,
  requestBody: Buffer,
  devId: string | null
) {
  if (!devId) {
    const resp = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic("out", null, "receive_cmd", resp.headers, resp.body);
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const { json } = parseBody(requestBody);

  // Upsert device
  const fkName = json?.fk_name || null;
  const firmware = json?.firmware || null;
  const fkBinDataLib = json?.fk_bin_data_lib || null;
  const supportedEnrollData = json?.supported_enroll_data
    ? JSON.stringify(json.supported_enroll_data)
    : null;

  await runAsync(
    `INSERT INTO devices (dev_id, fk_name, firmware, fk_bin_data_lib, supported_enroll_data, last_seen_at)
     VALUES (?, ?, ?, ?, ?, unixepoch('now') * 1000)
     ON CONFLICT(dev_id) DO UPDATE SET
       fk_name = excluded.fk_name,
       firmware = excluded.firmware,
       fk_bin_data_lib = excluded.fk_bin_data_lib,
       supported_enroll_data = excluded.supported_enroll_data,
       last_seen_at = unixepoch('now') * 1000`,
    [devId, fkName, firmware, fkBinDataLib, supportedEnrollData]
  );

  // Find oldest WAIT command for this device
  const command = await getAsync<{
    trans_id: number;
    cmd_code: string;
    cmd_param: string | null;
    cmd_binary: Buffer | null;
  }>(
    `SELECT trans_id, cmd_code, cmd_param, cmd_binary FROM commands
     WHERE dev_id = ? AND status = 'WAIT'
     ORDER BY created_at ASC LIMIT 1`,
    [devId]
  );

  if (command) {
    // Mark command as RUN
    await runAsync(
      `UPDATE commands SET status = 'RUN', updated_at = unixepoch('now') * 1000 WHERE trans_id = ?`,
      [command.trans_id]
    );

    // Build response with command
    const cmdParams = command.cmd_param ? JSON.parse(command.cmd_param) : {};
    const resp = buildResponse({
      responseCode: "OK",
      transId: command.trans_id,
      cmdCode: command.cmd_code,
      bodyJson: cmdParams,
      binary: command.cmd_binary,
    });

    await logRawTraffic("out", devId, "receive_cmd", resp.headers, resp.body);
    return new NextResponse(resp.body, {
      status: 200,
      headers: resp.headers,
    });
  } else {
    // No command pending
    if (NO_CMD_STRATEGY === "error") {
      const resp = buildResponse({ responseCode: "ERROR" });
      await logRawTraffic("out", devId, "receive_cmd", resp.headers, resp.body);
      return new NextResponse(resp.body, {
        status: 200,
        headers: resp.headers,
      });
    }

    // Default: ok_empty
    const resp = buildResponse({ responseCode: "OK" });
    await logRawTraffic("out", devId, "receive_cmd", resp.headers, resp.body);
    return new NextResponse(resp.body, {
      status: 200,
      headers: resp.headers,
    });
  }
}

export async function handleSendCmdResult(
  request: NextRequest,
  requestBody: Buffer,
  devId: string | null
) {
  if (!devId) {
    const resp = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic("out", null, "send_cmd_result", resp.headers, resp.body);
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const transId = request.headers.get("trans_id");
  const blkNo = request.headers.get("blk_no");
  const cmdReturnCode = request.headers.get("cmd_return_code") || "OK";

  if (!transId) {
    const resp = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic("out", devId, "send_cmd_result", resp.headers, resp.body);
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const blkNoNum = blkNo ? parseInt(blkNo, 10) : undefined;

  // If blk_no is present and not 0, this is a fragment
  if (blkNoNum !== undefined && blkNoNum !== 0) {
    // Store in block_buffer
    await runAsync(
      `INSERT INTO block_buffer (dev_id, trans_id, blk_no, data)
       VALUES (?, ?, ?, ?)`,
      [devId, transId, blkNoNum, requestBody]
    );

    const resp = buildResponse({ responseCode: "OK", transId });
    await logRawTraffic("out", devId, "send_cmd_result", resp.headers, resp.body);
    return new NextResponse(resp.body, {
      status: 200,
      headers: resp.headers,
    });
  }

  // This is either the final fragment (blk_no = 0) or a complete result
  let finalData = requestBody;

  if (blkNoNum === 0) {
    // Assemble from buffer
    const blocks = await allAsync<{ blk_no: number; data: Buffer }>(
      `SELECT blk_no, data FROM block_buffer
       WHERE dev_id = ? AND trans_id = ?
       ORDER BY blk_no ASC`,
      [devId, transId]
    );

    const buffers = blocks.map(b => b.data);
    buffers.push(requestBody); // Final block
    finalData = Buffer.concat(buffers);

    // Clean up block buffer
    await runAsync(
      `DELETE FROM block_buffer WHERE dev_id = ? AND trans_id = ?`,
      [devId, transId]
    );
  }

  // Parse result
  const { json: resultJson, binaries } = parseBody(finalData);
  const resultBinary = binaries.length > 0 ? binaries[0] : null;

  // Update command
  await runAsync(
    `UPDATE commands SET
       status = ?,
       result_json = ?,
       result_binary = ?,
       cmd_return_code = ?,
       updated_at = unixepoch('now') * 1000
     WHERE trans_id = ?`,
    [
      cmdReturnCode === "OK" ? "RESULT" : "ERROR",
      resultJson ? JSON.stringify(resultJson) : null,
      resultBinary,
      cmdReturnCode,
      transId,
    ]
  );

  // Special handling for certain commands
  if (cmdReturnCode === "OK" && resultJson) {
    const command = await getAsync<{ cmd_code: string }>(
      `SELECT cmd_code FROM commands WHERE trans_id = ?`,
      [transId]
    );

    if (command) {
      await handleCommandResult(devId, command.cmd_code, resultJson);
    }
  }

  const resp = buildResponse({ responseCode: "OK", transId });
  await logRawTraffic("out", devId, "send_cmd_result", resp.headers, resp.body);
  return new NextResponse(resp.body, {
    status: 200,
    headers: resp.headers,
  });
}

async function handleCommandResult(
  devId: string,
  cmdCode: string,
  resultJson: Record<string, any>
) {
  // Process results from commands that update state
  switch (cmdCode) {
    case "GET_DEVICE_STATUS":
      // Could update device status if needed
      break;

    case "GET_USER_ID_LIST":
      // Parse user list from result
      if (resultJson.user_id_array && resultJson.user_id_count) {
        // Binary parsing would go here
      }
      break;

    case "GET_LOG_DATA":
      // Log data would be processed here
      break;

    case "GET_USER_INFO":
      // User info update
      if (resultJson.user_id && resultJson.user_name) {
        const userId = resultJson.user_id;
        const userName = resultJson.user_name;
        const userPrivilege = resultJson.user_privilege;
        const userPhoto = resultJson.user_photo;

        await runAsync(
          `INSERT INTO users (dev_id, user_id, user_name, user_privilege, user_photo)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(dev_id, user_id) DO UPDATE SET
             user_name = excluded.user_name,
             user_privilege = excluded.user_privilege,
             user_photo = excluded.user_photo`,
          [devId, userId, userName, userPrivilege, userPhoto]
        );
      }
      break;
  }
}

export async function handleRealtimeGlog(
  request: NextRequest,
  requestBody: Buffer,
  devId: string | null
) {
  if (!devId) {
    const resp = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic("out", null, "realtime_glog", resp.headers, resp.body);
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const { json, binaries } = parseBody(requestBody);

  if (!json) {
    const resp = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic("out", devId, "realtime_glog", resp.headers, resp.body);
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const userId = json.user_id;
  const verifyMode = json.verify_mode
    ? Array.isArray(json.verify_mode)
      ? JSON.stringify(json.verify_mode)
      : json.verify_mode
    : null;
  const ioMode = json.io_mode;
  const ioTime = json.io_time;
  const logImage = binaries.length > 0 ? binaries[0] : null;

  await runAsync(
    `INSERT INTO attendance_logs (dev_id, user_id, verify_mode, io_mode, io_time, log_image)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [devId, userId, verifyMode, ioMode, ioTime, logImage]
  );

  const resp = buildResponse({ responseCode: "OK" });
  await logRawTraffic("out", devId, "realtime_glog", resp.headers, resp.body);
  return new NextResponse(resp.body, {
    status: 200,
    headers: resp.headers,
  });
}

export async function handleRealtimeEnrollData(
  request: NextRequest,
  requestBody: Buffer,
  devId: string | null
) {
  if (!devId) {
    const resp = buildResponse({ responseCode: "ERROR" });
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  const { json } = parseBody(requestBody);

  if (!json || !json.user_id) {
    const resp = buildResponse({ responseCode: "ERROR" });
    return new NextResponse(resp.body, { status: 400, headers: resp.headers });
  }

  // Simplified: just insert the user, don't try to parse multiple enrollments
  // TODO: Fix the enrollment loop - appears to cause issues with sqlite3/async
  const userId = String(json.user_id);
  const userName = String(json.user_name || "");
  const userPrivilege = String(json.user_privilege || "USER");

  await runAsync(
    `INSERT INTO users (dev_id, user_id, user_name, user_privilege)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(dev_id, user_id) DO NOTHING`,
    [devId, userId, userName, userPrivilege]
  );

  const resp = buildResponse({ responseCode: "OK" });
  return new NextResponse(resp.body, {
    status: 200,
    headers: resp.headers,
  });
}
