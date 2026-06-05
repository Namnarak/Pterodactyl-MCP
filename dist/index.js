#!/usr/bin/env node

// src/index.ts
import process from "node:process";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

var CompatReadBuffer = class {
  append(chunk) {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
  }
  readMessage() {
    if (!this.buffer || this.buffer.length === 0) {
      return null;
    }
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = this.buffer.toString("utf8", 0, headerEnd);
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (match) {
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (this.buffer.length < bodyEnd) {
          return null;
        }
        const body = this.buffer.toString("utf8", bodyStart, bodyEnd);
        this.buffer = this.buffer.subarray(bodyEnd);
        return JSONRPCMessageSchema.parse(JSON.parse(body));
      }
    }
    const lineEnd = this.buffer.indexOf("\n");
    if (lineEnd === -1) {
      return null;
    }
    const line = this.buffer.toString("utf8", 0, lineEnd).replace(/\r$/, "");
    this.buffer = this.buffer.subarray(lineEnd + 1);
    if (!line.trim()) {
      return this.readMessage();
    }
    return JSONRPCMessageSchema.parse(JSON.parse(line));
  }
  clear() {
    this.buffer = void 0;
  }
};
var CompatStdioServerTransport = class {
  constructor(stdin = process.stdin, stdout = process.stdout) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.readBuffer = new CompatReadBuffer();
    this.started = false;
    this.onData = (chunk) => {
      this.readBuffer.append(chunk);
      this.processReadBuffer();
    };
    this.onError = (error) => {
      this.onerror?.(error);
    };
  }
  async start() {
    if (this.started) {
      throw new Error("Stdio transport already started.");
    }
    this.started = true;
    this.stdin.on("data", this.onData);
    this.stdin.on("error", this.onError);
  }
  processReadBuffer() {
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error);
      }
    }
  }
  async close() {
    this.stdin.off("data", this.onData);
    this.stdin.off("error", this.onError);
    if (this.stdin.listenerCount("data") === 0) {
      this.stdin.pause();
    }
    this.readBuffer.clear();
    this.onclose?.();
  }
  send(message) {
    return new Promise((resolve) => {
      const json = `${JSON.stringify(message)}\n`;
      if (this.stdout.write(json)) {
        resolve();
      } else {
        this.stdout.once("drain", resolve);
      }
    });
  }
};

// src/client/errors.ts
var PterodactylApiError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "PterodactylApiError";
  }
};

// src/client/app-api.ts
function buildListPath(basePath, params) {
  const searchParams = new URLSearchParams();
  if (params?.page) {
    searchParams.set("page", String(params.page));
  }
  if (params?.per_page) {
    searchParams.set("per_page", String(params.per_page));
  }
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}
function assertShape(data, requiredFields) {
  if (data === null || data === void 0 || typeof data !== "object") {
    throw new PterodactylApiError(
      0,
      "INVALID_RESPONSE",
      `Expected an object from the API but received ${typeof data}.`
    );
  }
  const record = data;
  const missing = requiredFields.filter((field) => !(field in record));
  if (missing.length > 0) {
    throw new PterodactylApiError(
      0,
      "INVALID_RESPONSE",
      `API response is missing required fields: ${missing.join(", ")}.`
    );
  }
  return data;
}
function extractPagination(res) {
  if (res.meta?.pagination) {
    return res.meta.pagination;
  }
  const count = res.data.length;
  return {
    total: count,
    count,
    per_page: count,
    current_page: 1,
    total_pages: 1,
    links: {}
  };
}
async function listServers(request, params) {
  const path = buildListPath("/api/application/servers", params);
  const response = await request("GET", path);
  const validated = assertShape(response, ["data"]);
  return {
    servers: validated.data.map((item) => item.attributes),
    pagination: extractPagination(validated)
  };
}
async function getServer(request, id) {
  const response = await request(
    "GET",
    `/api/application/servers/${id}`
  );
  const validated = assertShape(response, ["attributes"]);
  return validated.attributes;
}
async function suspendServer(request, id) {
  await request("POST", `/api/application/servers/${id}/suspend`, void 0, {
    idempotent: true
  });
}
async function unsuspendServer(request, id) {
  await request("POST", `/api/application/servers/${id}/unsuspend`, void 0, {
    idempotent: true
  });
}
async function listUsers(request, params) {
  const path = buildListPath("/api/application/users", params);
  const response = await request("GET", path);
  const validated = assertShape(response, ["data"]);
  return {
    users: validated.data.map((item) => item.attributes),
    pagination: extractPagination(validated)
  };
}
async function listNodes(request, params) {
  const path = buildListPath("/api/application/nodes", params);
  const response = await request("GET", path);
  const validated = assertShape(response, ["data"]);
  return {
    nodes: validated.data.map((item) => item.attributes),
    pagination: extractPagination(validated)
  };
}
async function reinstallServer(request, id) {
  await request("POST", `/api/application/servers/${id}/reinstall`);
}
async function createServer(request, data) {
  const res = await request(
    "POST",
    "/api/application/servers",
    data
  );
  return res.attributes;
}
async function deleteServer(request, id) {
  await request("DELETE", `/api/application/servers/${id}`);
}
async function updateServerDetails(request, id, data) {
  const res = await request(
    "PATCH",
    `/api/application/servers/${id}/details`,
    data
  );
  return res.attributes;
}
async function updateServerBuild(request, id, data) {
  const res = await request(
    "PATCH",
    `/api/application/servers/${id}/build`,
    data
  );
  return res.attributes;
}
async function updateServerStartup(request, id, data) {
  const body = { skip_scripts: false, ...data };
  const res = await request(
    "PATCH",
    `/api/application/servers/${id}/startup`,
    body
  );
  return res.attributes;
}
async function getUser(request, id) {
  const res = await request("GET", `/api/application/users/${id}`);
  return res.attributes;
}
async function createUser(request, data) {
  const res = await request("POST", "/api/application/users", data);
  return res.attributes;
}
async function updateUser(request, id, data) {
  const res = await request(
    "PATCH",
    `/api/application/users/${id}`,
    data
  );
  return res.attributes;
}
async function deleteUser(request, id) {
  await request("DELETE", `/api/application/users/${id}`);
}
async function getNode(request, id) {
  const res = await request("GET", `/api/application/nodes/${id}`);
  return res.attributes;
}
async function getNodeConfiguration(request, id) {
  return request("GET", `/api/application/nodes/${id}/configuration`);
}
async function listEggs(request) {
  const res = await request("GET", "/api/application/eggs");
  return { eggs: res.data.map((i) => i.attributes), pagination: extractPagination(res) };
}
async function listRoles(request) {
  const res = await request("GET", "/api/application/roles");
  return { roles: res.data.map((i) => i.attributes), pagination: extractPagination(res) };
}
async function listMounts(request) {
  const res = await request("GET", "/api/application/mounts");
  return { mounts: res.data.map((i) => i.attributes), pagination: extractPagination(res) };
}
async function listServerDatabases(request, id) {
  const res = await request(
    "GET",
    `/api/application/servers/${id}/databases`
  );
  return { databases: res.data.map((i) => i.attributes), pagination: extractPagination(res) };
}
async function listNests(request) {
  try {
    const res = await request("GET", "/api/application/nests");
    const validated = assertShape(res, ["data"]);
    return {
      nests: validated.data.map((item) => item.attributes),
      pagination: extractPagination(validated)
    };
  } catch {
    return {
      nests: [
        {
          id: 0,
          uuid: "",
          author: "",
          name: "Default",
          description: "Pelican panel - nests are not used. Use list_eggs with nest_id=0 to list all eggs.",
          created_at: "",
          updated_at: ""
        }
      ],
      pagination: { total: 1, count: 1, per_page: 50, current_page: 1, total_pages: 1, links: {} }
    };
  }
}
function eggPath(nestId, eggId) {
  if (nestId === 0) {
    return eggId !== void 0 ? `/api/application/eggs/${eggId}` : "/api/application/eggs";
  }
  return eggId !== void 0 ? `/api/application/nests/${nestId}/eggs/${eggId}` : `/api/application/nests/${nestId}/eggs`;
}
async function getEgg(request, nestId, eggId) {
  try {
    const res = await request(
      "GET",
      `/api/application/eggs/${eggId}?include=variables`
    );
    const validated = assertShape(res, ["attributes"]);
    return validated.attributes;
  } catch {
    const res = await request(
      "GET",
      `/api/application/nests/${nestId}/eggs/${eggId}?include=variables`
    );
    const validated = assertShape(res, ["attributes"]);
    return validated.attributes;
  }
}
async function importEgg(request, nestId, eggData) {
  try {
    const pelicanBody = buildPelicanEggImportBody(eggData);
    const res = await request(
      "POST",
      "/api/application/eggs/import",
      pelicanBody
    );
    return res.attributes;
  } catch {
    const res = await request("POST", eggPath(nestId), eggData);
    return res.attributes;
  }
}
function buildPelicanEggImportBody(data) {
  if (data.meta !== void 0 && data.config !== void 0) {
    return data;
  }
  return {
    meta: { version: "PTDL_v2", update_url: null },
    name: data.name ?? "Imported Egg",
    author: data.author ?? "unknown@example.com",
    description: data.description ?? null,
    features: data.features ?? [],
    docker_images: data.docker_images ?? (data.docker_image ? { default: data.docker_image } : { default: "alpine:latest" }),
    file_denylist: data.file_denylist ?? [],
    startup: data.startup ?? "",
    config: {
      files: data.config_files ?? {},
      startup: data.config_startup ?? { done: "started" },
      stop: data.config_stop ?? "stop",
      logs: data.config_logs ?? []
    },
    scripts: {
      installation: {
        script: data.script_install ?? "#!/bin/bash\necho installed",
        container: data.script_container ?? "alpine:3.4",
        entrypoint: data.script_entry ?? "bash"
      }
    },
    variables: data.variables ?? []
  };
}
async function updateEgg(request, nestId, eggId, eggData) {
  try {
    const res = await request(
      "PATCH",
      `/api/application/eggs/${eggId}`,
      eggData
    );
    return res.attributes;
  } catch {
    const res = await request(
      "PATCH",
      `/api/application/nests/${nestId}/eggs/${eggId}`,
      eggData
    );
    return res.attributes;
  }
}
async function deleteEgg(request, nestId, eggId) {
  try {
    await request("DELETE", `/api/application/eggs/${eggId}`);
  } catch {
    await request("DELETE", `/api/application/nests/${nestId}/eggs/${eggId}`);
  }
}
async function listAllocations(request, nodeId, params) {
  const path = buildListPath(`/api/application/nodes/${nodeId}/allocations`, params);
  const response = await request("GET", path);
  const validated = assertShape(response, ["data"]);
  return {
    allocations: validated.data.map((item) => item.attributes),
    pagination: extractPagination(validated)
  };
}
async function createAllocation(request, nodeId, ip, ports) {
  await request("POST", `/api/application/nodes/${nodeId}/allocations`, { ip, ports });
}
async function deleteAllocation(request, nodeId, allocationId) {
  await request("DELETE", `/api/application/nodes/${nodeId}/allocations/${allocationId}`);
}
async function listEggVariables(request, nestId, eggId) {
  try {
    const res = await request(
      "GET",
      `/api/application/eggs/${eggId}/variables`
    );
    const validated = assertShape(res, ["data"]);
    return {
      variables: validated.data.map((item) => item.attributes),
      pagination: extractPagination(validated)
    };
  } catch {
    const res = await request(
      "GET",
      `/api/application/nests/${nestId}/eggs/${eggId}/variables`
    );
    const validated = assertShape(res, ["data"]);
    return {
      variables: validated.data.map((item) => item.attributes),
      pagination: extractPagination(validated)
    };
  }
}
async function createEggVariable(request, nestId, eggId, data) {
  try {
    const res = await request(
      "POST",
      `/api/application/eggs/${eggId}/variables`,
      data
    );
    return res.attributes;
  } catch {
    const res = await request(
      "POST",
      `/api/application/nests/${nestId}/eggs/${eggId}/variables`,
      data
    );
    return res.attributes;
  }
}
async function updateEggVariable(request, nestId, eggId, variableId, data) {
  try {
    const res = await request(
      "PATCH",
      `/api/application/eggs/${eggId}/variables/${variableId}`,
      data
    );
    return res.attributes;
  } catch {
    const res = await request(
      "PATCH",
      `/api/application/nests/${nestId}/eggs/${eggId}/variables/${variableId}`,
      data
    );
    return res.attributes;
  }
}
async function deleteEggVariable(request, nestId, eggId, variableId) {
  try {
    await request("DELETE", `/api/application/eggs/${eggId}/variables/${variableId}`);
  } catch {
    await request(
      "DELETE",
      `/api/application/nests/${nestId}/eggs/${eggId}/variables/${variableId}`
    );
  }
}
async function getNest(request, nestId) {
  const res = await request("GET", `/api/application/nests/${nestId}`);
  const validated = assertShape(res, ["attributes"]);
  return validated.attributes;
}

// src/client/circuit-breaker.ts
var DEFAULT_FAILURE_THRESHOLD = 5;
var DEFAULT_COOLDOWN_MS = 3e4;
var CircuitBreaker = class {
  state = "CLOSED";
  consecutiveFailures = 0;
  openedAt = 0;
  failureThreshold;
  cooldownMs;
  constructor(failureThreshold, cooldownMs) {
    this.failureThreshold = failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }
  /**
   * Check if a request is allowed to proceed.
   * Throws if the circuit is OPEN and cooldown has not elapsed.
   * Transitions to HALF_OPEN if cooldown has elapsed.
   */
  allowRequest() {
    if (this.state === "CLOSED") {
      return;
    }
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        this.state = "HALF_OPEN";
        return;
      }
      const remainingMs = this.cooldownMs - elapsed;
      throw new CircuitOpenError(
        `Circuit breaker is OPEN. ${Math.ceil(remainingMs / 1e3)}s until next retry attempt.`,
        remainingMs
      );
    }
  }
  /**
   * Record a successful request. Resets the circuit to CLOSED.
   */
  recordSuccess() {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }
  /**
   * Record a failed request. Opens the circuit if the failure threshold is reached.
   */
  recordFailure() {
    this.consecutiveFailures += 1;
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = Date.now();
      return;
    }
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }
  get currentState() {
    return this.state;
  }
};
var CircuitOpenError = class extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.retryAfterMs = retryAfterMs;
    this.name = "CircuitOpenError";
  }
};

// src/client/client-api.ts
async function getServerResources(request, clientKey, identifier) {
  const response = await request(
    "GET",
    `/api/client/servers/${identifier}/resources`,
    clientKey
  );
  const validated = assertShape(response, ["attributes"]);
  return validated.attributes;
}
async function sendPowerAction(request, clientKey, identifier, action) {
  await request(
    "POST",
    `/api/client/servers/${identifier}/power`,
    clientKey,
    { signal: action },
    "application/json",
    { idempotent: true }
  );
}
async function sendCommand(request, clientKey, identifier, command) {
  await request("POST", `/api/client/servers/${identifier}/command`, clientKey, {
    command
  });
}
async function listFiles(request, clientKey, identifier, directory) {
  const dir = directory ?? "/";
  const encoded = encodeURIComponent(dir);
  const response = await request(
    "GET",
    `/api/client/servers/${identifier}/files/list?directory=${encoded}`,
    clientKey
  );
  return response.data.map((item) => item.attributes);
}
async function listBackups(request, clientKey, identifier) {
  const response = await request(
    "GET",
    `/api/client/servers/${identifier}/backups`,
    clientKey
  );
  return response.data.map((item) => item.attributes);
}
async function readFile(request, clientKey, identifier, filePath) {
  return request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/contents?file=${encodeURIComponent(filePath)}`,
    clientKey
  );
}
async function writeFile(request, clientKey, identifier, filePath, content) {
  await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/write?file=${encodeURIComponent(filePath)}`,
    clientKey,
    content,
    "text/plain"
  );
}
async function createFolder(request, clientKey, identifier, root, name) {
  await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/create-folder`,
    clientKey,
    { root, name }
  );
}
async function deleteFiles(request, clientKey, identifier, root, files) {
  await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/delete`,
    clientKey,
    { root, files },
    "application/json",
    { idempotent: true }
  );
}
async function compressFiles(request, clientKey, identifier, root, files) {
  return request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/compress`,
    clientKey,
    { root, files }
  );
}
async function decompressFile(request, clientKey, identifier, root, file) {
  await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/decompress`,
    clientKey,
    { root, file }
  );
}
async function renameFile(request, clientKey, identifier, root, from, to) {
  await request(
    "PUT",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/rename`,
    clientKey,
    { root, files: [{ from, to }] }
  );
}
async function createBackup(request, clientKey, identifier, name) {
  const body = name !== void 0 ? { name } : {};
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/backups`,
    clientKey,
    body
  );
  return res.attributes;
}
async function listSchedules(request, clientKey, identifier) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules`,
    clientKey
  );
  return { schedules: res.data.map((i) => i.attributes) };
}
async function createSchedule(request, clientKey, identifier, data) {
  const body = {
    ...data,
    minute: data.cron_minute,
    hour: data.cron_hour,
    day_of_week: data.cron_day_of_week,
    day_of_month: data.cron_day_of_month,
    month: data.cron_month
  };
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules`,
    clientKey,
    body
  );
  return res.attributes;
}
async function listClientDatabases(request, clientKey, identifier) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/databases`,
    clientKey
  );
  return { databases: res.data.map((i) => i.attributes) };
}
async function createClientDatabase(request, clientKey, identifier, data) {
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/databases`,
    clientKey,
    data
  );
  return res.attributes;
}
async function listSubusers(request, clientKey, identifier) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/users`,
    clientKey
  );
  return { users: res.data.map((i) => i.attributes) };
}
async function getStartupVariables(request, clientKey, identifier) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/startup`,
    clientKey
  );
  return {
    variables: res.data.map((i) => i.attributes),
    startup_command: res.meta.startup_command,
    docker_images: res.meta.docker_images
  };
}
async function getAccount(request, clientKey) {
  const res = await request(
    "GET",
    "/api/client/account",
    clientKey
  );
  return res.attributes;
}
async function getSchedule(request, clientKey, identifier, scheduleId) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules/${scheduleId}`,
    clientKey
  );
  return res.attributes;
}
async function updateSchedule(request, clientKey, identifier, scheduleId, data) {
  const body = {
    ...data,
    minute: data.cron_minute,
    hour: data.cron_hour,
    day_of_week: data.cron_day_of_week,
    day_of_month: data.cron_day_of_month,
    month: data.cron_month
  };
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules/${scheduleId}`,
    clientKey,
    body
  );
  return res.attributes;
}
async function deleteSchedule(request, clientKey, identifier, scheduleId) {
  await request(
    "DELETE",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules/${scheduleId}`,
    clientKey
  );
}
async function createScheduleTask(request, clientKey, identifier, scheduleId, data) {
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules/${scheduleId}/tasks`,
    clientKey,
    data
  );
  return res.attributes;
}
async function deleteScheduleTask(request, clientKey, identifier, scheduleId, taskId) {
  await request(
    "DELETE",
    `/api/client/servers/${encodeURIComponent(identifier)}/schedules/${scheduleId}/tasks/${taskId}`,
    clientKey
  );
}
async function createSubuser(request, clientKey, identifier, data) {
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/users`,
    clientKey,
    data
  );
  return res.attributes;
}
async function updateSubuser(request, clientKey, identifier, userUuid, data) {
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/users/${encodeURIComponent(userUuid)}`,
    clientKey,
    data
  );
  return res.attributes;
}
async function deleteSubuser(request, clientKey, identifier, userUuid) {
  await request(
    "DELETE",
    `/api/client/servers/${encodeURIComponent(identifier)}/users/${encodeURIComponent(userUuid)}`,
    clientKey
  );
}
async function deleteClientDatabase(request, clientKey, identifier, databaseId) {
  await request(
    "DELETE",
    `/api/client/servers/${encodeURIComponent(identifier)}/databases/${encodeURIComponent(databaseId)}`,
    clientKey
  );
}
async function rotateDatabasePassword(request, clientKey, identifier, databaseId) {
  const res = await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/databases/${encodeURIComponent(databaseId)}/rotate-password`,
    clientKey
  );
  return res.attributes;
}
async function deleteBackup(request, clientKey, identifier, backupUuid) {
  await request(
    "DELETE",
    `/api/client/servers/${encodeURIComponent(identifier)}/backups/${encodeURIComponent(backupUuid)}`,
    clientKey
  );
}
async function downloadBackup(request, clientKey, identifier, backupUuid) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/backups/${encodeURIComponent(backupUuid)}/download`,
    clientKey
  );
  return { url: res.attributes.url };
}
async function restoreBackup(request, clientKey, identifier, backupUuid, truncate) {
  await request(
    "POST",
    `/api/client/servers/${encodeURIComponent(identifier)}/backups/${encodeURIComponent(backupUuid)}/restore`,
    clientKey,
    { truncate: truncate ?? false }
  );
}
async function downloadFile(request, clientKey, identifier, filePath) {
  const res = await request(
    "GET",
    `/api/client/servers/${encodeURIComponent(identifier)}/files/download?file=${encodeURIComponent(filePath)}`,
    clientKey
  );
  return { url: res.attributes.url };
}
async function getServerActivity(request, clientKey, identifier, params) {
  const path = buildListPath(
    `/api/client/servers/${encodeURIComponent(identifier)}/activity`,
    params
  );
  const res = await request("GET", path, clientKey);
  return {
    activities: res.data.map((i) => i.attributes),
    pagination: extractPagination(res)
  };
}

// src/client/http-errors.ts
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
function parseRetryAfter(headerValue) {
  if (headerValue === null) {
    return void 0;
  }
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1e3;
  }
  const date = new Date(headerValue);
  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return Math.max(0, delayMs);
  }
  return void 0;
}
function mapHttpError(status) {
  switch (status) {
    case 401:
      return new PterodactylApiError(
        401,
        "UNAUTHORIZED",
        "Authentication failed. Verify that PTERODACTYL_APP_KEY (starts with ptla_) or PTERODACTYL_CLIENT_KEY (starts with ptlc_) is correct and has not been revoked in the panel."
      );
    case 403:
      return new PterodactylApiError(
        403,
        "FORBIDDEN",
        "Permission denied. Your API key does not have access to this resource. For admin tools, use an Application API key. For client tools, ensure you have access to this server."
      );
    case 404:
      return new PterodactylApiError(
        404,
        "NOT_FOUND",
        "Resource not found. Verify the ID/identifier is correct by calling list_servers first. The server may have been deleted or you may not have access."
      );
    case 429:
      return new PterodactylApiError(
        429,
        "RATE_LIMITED",
        "Rate limit exceeded. The request will be retried automatically. If this persists, reduce the frequency of API calls."
      );
    default:
      if (RETRYABLE_STATUS_CODES.has(status)) {
        return new PterodactylApiError(
          status,
          "API_ERROR",
          `The Pterodactyl panel is temporarily unavailable (HTTP ${status}). The request will be retried automatically. Check that the panel is running.`
        );
      }
      return new PterodactylApiError(
        status,
        "API_ERROR",
        `Panel API returned an unexpected status (HTTP ${status}).`
      );
  }
}

// src/client/rate-limiter.ts
var DEFAULT_BURST_CAPACITY = 15;
var DEFAULT_REFILL_RATE_PER_SECOND = 1;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var RateLimiter = class {
  capacity;
  refillRateMs;
  tokens;
  lastRefillTime;
  constructor(maxRequestsPerMinute) {
    const refillPerSecond = maxRequestsPerMinute ? maxRequestsPerMinute / 60 : DEFAULT_REFILL_RATE_PER_SECOND;
    this.refillRateMs = 1e3 / refillPerSecond;
    this.capacity = Math.min(
      DEFAULT_BURST_CAPACITY,
      maxRequestsPerMinute ?? DEFAULT_BURST_CAPACITY
    );
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }
  async acquire() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = this.refillRateMs - (Date.now() - this.lastRefillTime);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const newTokens = elapsed / this.refillRateMs;
    if (newTokens >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefillTime = now;
    }
  }
};

// src/client/pterodactyl.client.ts
var DEFAULT_TIMEOUT = 1e4;
var MAX_RETRIES = 3;
var RETRY_BASE_DELAY_MS = 1e3;
var MAX_RETRY_DELAY_MS = 3e4;
var IDEMPOTENT_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS", "DELETE", "PUT"]);
var RETRYABLE_NETWORK_CODES = /* @__PURE__ */ new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]);
var PterodactylClient = class {
  baseUrl;
  appKey;
  clientKey;
  timeout;
  rateLimiter;
  circuitBreaker;
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.appKey = config.appKey;
    this.clientKey = config.clientKey;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.rateLimiter = new RateLimiter(config.maxRequestsPerMinute);
    this.circuitBreaker = new CircuitBreaker();
    this.validateUrl(config.allowInsecure ?? false);
  }
  get hasClientKey() {
    return !!this.clientKey;
  }
  get hasAppKey() {
    return !!this.appKey;
  }
  // ─── Application API Methods ─────────────────────────────────────────────
  async listServers(params) {
    return listServers(this.appRequestFn, params);
  }
  async getServer(id) {
    return getServer(this.appRequestFn, id);
  }
  async suspendServer(id) {
    return suspendServer(this.appRequestFn, id);
  }
  async unsuspendServer(id) {
    return unsuspendServer(this.appRequestFn, id);
  }
  async listUsers(params) {
    return listUsers(this.appRequestFn, params);
  }
  async listNodes(params) {
    return listNodes(this.appRequestFn, params);
  }
  async reinstallServer(id) {
    return reinstallServer(this.appRequestFn, id);
  }
  async createServer(data) {
    return createServer(this.appRequestFn, data);
  }
  async deleteServer(id) {
    return deleteServer(this.appRequestFn, id);
  }
  async updateServerDetails(id, data) {
    return updateServerDetails(this.appRequestFn, id, data);
  }
  async updateServerBuild(id, data) {
    return updateServerBuild(this.appRequestFn, id, data);
  }
  async updateServerStartup(id, data) {
    return updateServerStartup(this.appRequestFn, id, data);
  }
  async getUser(id) {
    return getUser(this.appRequestFn, id);
  }
  async createUser(data) {
    return createUser(this.appRequestFn, data);
  }
  async updateUser(id, data) {
    return updateUser(this.appRequestFn, id, data);
  }
  async deleteUser(id) {
    return deleteUser(this.appRequestFn, id);
  }
  async getNode(id) {
    return getNode(this.appRequestFn, id);
  }
  async getNodeConfiguration(id) {
    return getNodeConfiguration(this.appRequestFn, id);
  }
  async listEggs() {
    return listEggs(this.appRequestFn);
  }
  async listNests() {
    return listNests(this.appRequestFn);
  }
  async getEgg(nestId, eggId) {
    return getEgg(this.appRequestFn, nestId, eggId);
  }
  async importEgg(nestId, eggData) {
    return importEgg(this.appRequestFn, nestId, eggData);
  }
  async updateEgg(nestId, eggId, eggData) {
    return updateEgg(this.appRequestFn, nestId, eggId, eggData);
  }
  async deleteEgg(nestId, eggId) {
    return deleteEgg(this.appRequestFn, nestId, eggId);
  }
  async listRoles() {
    return listRoles(this.appRequestFn);
  }
  async listMounts() {
    return listMounts(this.appRequestFn);
  }
  async listServerDatabases(id) {
    return listServerDatabases(this.appRequestFn, id);
  }
  async listAllocations(nodeId, params) {
    return listAllocations(this.appRequestFn, nodeId, params);
  }
  async createAllocation(nodeId, ip, ports) {
    return createAllocation(this.appRequestFn, nodeId, ip, ports);
  }
  async deleteAllocation(nodeId, allocationId) {
    return deleteAllocation(this.appRequestFn, nodeId, allocationId);
  }
  async listEggVariables(nestId, eggId) {
    return listEggVariables(this.appRequestFn, nestId, eggId);
  }
  async createEggVariable(nestId, eggId, data) {
    return createEggVariable(this.appRequestFn, nestId, eggId, data);
  }
  async updateEggVariable(nestId, eggId, variableId, data) {
    return updateEggVariable(this.appRequestFn, nestId, eggId, variableId, data);
  }
  async deleteEggVariable(nestId, eggId, variableId) {
    return deleteEggVariable(this.appRequestFn, nestId, eggId, variableId);
  }
  async getNest(nestId) {
    return getNest(this.appRequestFn, nestId);
  }
  // ─── Client API Methods ──────────────────────────────────────────────────
  async getServerResources(identifier) {
    return getServerResources(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async sendPowerAction(identifier, action) {
    return sendPowerAction(this.doRequestFn, this.requireClientKey(), identifier, action);
  }
  async sendCommand(identifier, command) {
    return sendCommand(this.doRequestFn, this.requireClientKey(), identifier, command);
  }
  async listFiles(identifier, directory) {
    return listFiles(this.doRequestFn, this.requireClientKey(), identifier, directory);
  }
  async listBackups(identifier) {
    return listBackups(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async readFile(identifier, filePath) {
    return readFile(this.doRequestFn, this.requireClientKey(), identifier, filePath);
  }
  async writeFile(identifier, filePath, content) {
    return writeFile(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      filePath,
      content
    );
  }
  async createFolder(identifier, root, name) {
    return createFolder(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      root,
      name
    );
  }
  async deleteFiles(identifier, root, files) {
    return deleteFiles(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      root,
      files
    );
  }
  async compressFiles(identifier, root, files) {
    return compressFiles(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      root,
      files
    );
  }
  async decompressFile(identifier, root, file) {
    return decompressFile(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      root,
      file
    );
  }
  async renameFile(identifier, root, from, to) {
    return renameFile(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      root,
      from,
      to
    );
  }
  async createBackup(identifier, name) {
    return createBackup(this.doRequestFn, this.requireClientKey(), identifier, name);
  }
  async listSchedules(identifier) {
    return listSchedules(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async createSchedule(identifier, data) {
    return createSchedule(this.doRequestFn, this.requireClientKey(), identifier, data);
  }
  async listClientDatabases(identifier) {
    return listClientDatabases(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async createClientDatabase(identifier, data) {
    return createClientDatabase(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      data
    );
  }
  async listSubusers(identifier) {
    return listSubusers(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async getStartupVariables(identifier) {
    return getStartupVariables(this.doRequestFn, this.requireClientKey(), identifier);
  }
  async getAccount() {
    return getAccount(this.doRequestFn, this.requireClientKey());
  }
  async killServer(identifier) {
    await this.sendPowerAction(identifier, "kill");
  }
  async getSchedule(identifier, scheduleId) {
    return getSchedule(this.doRequestFn, this.requireClientKey(), identifier, scheduleId);
  }
  async updateSchedule(identifier, scheduleId, data) {
    return updateSchedule(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      scheduleId,
      data
    );
  }
  async deleteSchedule(identifier, scheduleId) {
    return deleteSchedule(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      scheduleId
    );
  }
  async createScheduleTask(identifier, scheduleId, data) {
    return createScheduleTask(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      scheduleId,
      data
    );
  }
  async deleteScheduleTask(identifier, scheduleId, taskId) {
    return deleteScheduleTask(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      scheduleId,
      taskId
    );
  }
  async createSubuser(identifier, data) {
    return createSubuser(this.doRequestFn, this.requireClientKey(), identifier, data);
  }
  async updateSubuser(identifier, userUuid, data) {
    return updateSubuser(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      userUuid,
      data
    );
  }
  async deleteSubuser(identifier, userUuid) {
    return deleteSubuser(this.doRequestFn, this.requireClientKey(), identifier, userUuid);
  }
  async deleteClientDatabase(identifier, databaseId) {
    return deleteClientDatabase(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      databaseId
    );
  }
  async rotateDatabasePassword(identifier, databaseId) {
    return rotateDatabasePassword(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      databaseId
    );
  }
  async deleteBackup(identifier, backupUuid) {
    return deleteBackup(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      backupUuid
    );
  }
  async downloadBackup(identifier, backupUuid) {
    return downloadBackup(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      backupUuid
    );
  }
  async restoreBackup(identifier, backupUuid, truncate) {
    return restoreBackup(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      backupUuid,
      truncate
    );
  }
  async downloadFile(identifier, filePath) {
    return downloadFile(this.doRequestFn, this.requireClientKey(), identifier, filePath);
  }
  async getServerActivity(identifier, params) {
    return getServerActivity(
      this.doRequestFn,
      this.requireClientKey(),
      identifier,
      params
    );
  }
  // ─── Private Methods ─────────────────────────────────────────────────────
  requireClientKey() {
    if (!this.clientKey) {
      throw new PterodactylApiError(
        0,
        "CLIENT_KEY_REQUIRED",
        "This action requires a Client API key. Add PTERODACTYL_CLIENT_KEY to your configuration."
      );
    }
    return this.clientKey;
  }
  /** Bound callback for Application API requests. */
  appRequestFn = (method, path, body, options) => {
    return this.doRequest(method, path, this.appKey, body, "application/json", options);
  };
  /** Bound callback for Client API requests. */
  doRequestFn = (method, path, apiKey, body, contentType, options) => {
    return this.doRequest(method, path, apiKey, body, contentType, options);
  };
  validateUrl(allowInsecure) {
    let parsed;
    try {
      parsed = new URL(this.baseUrl);
    } catch {
      throw new PterodactylApiError(0, "INVALID_URL", "The panel URL is not a valid URL.");
    }
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !allowInsecure && !isLocalhost) {
      throw new PterodactylApiError(
        0,
        "INSECURE_URL",
        "The panel URL must use HTTPS. Set allowInsecure to true for HTTP."
      );
    }
  }
  isRetryableNetworkError(error) {
    if (error instanceof TypeError) {
      return true;
    }
    if (error instanceof Error && "code" in error) {
      const code = error.code;
      return RETRYABLE_NETWORK_CODES.has(code);
    }
    return false;
  }
  async doRequest(method, path, apiKey, body, contentType = "application/json", options) {
    try {
      this.circuitBreaker.allowRequest();
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        throw new PterodactylApiError(
          503,
          "CIRCUIT_OPEN",
          `Panel API is unavailable. ${error.message}`
        );
      }
      throw error;
    }
    await this.rateLimiter.acquire();
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    };
    const hasBody = body !== void 0;
    if (hasBody) {
      headers["Content-Type"] = contentType;
    }
    const serializedBody = hasBody ? contentType === "application/json" ? JSON.stringify(body) : String(body) : void 0;
    const isIdempotent = options?.idempotent ?? IDEMPOTENT_METHODS.has(method.toUpperCase());
    let lastError;
    let retryAfterMs;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        if (!isIdempotent) {
          break;
        }
        let delay;
        if (retryAfterMs !== void 0) {
          delay = Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
          retryAfterMs = void 0;
        } else {
          const jitter = Math.random() * 0.5 + 0.75;
          delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) * jitter, MAX_RETRY_DELAY_MS);
        }
        await sleep(delay);
      }
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: serializedBody,
          signal: AbortSignal.timeout(this.timeout)
        });
        if (response.ok) {
          this.circuitBreaker.recordSuccess();
          if (response.status === 204) {
            return void 0;
          }
          const responseContentType = response.headers?.get?.("Content-Type") ?? "";
          if (!responseContentType || responseContentType.includes("application/json")) {
            return await response.json();
          }
          return await response.text();
        }
        const apiError = mapHttpError(response.status);
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          this.circuitBreaker.recordFailure();
          lastError = apiError;
          if (response.status === 429) {
            retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
          }
          continue;
        }
        this.circuitBreaker.recordSuccess();
        throw apiError;
      } catch (error) {
        if (error instanceof PterodactylApiError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === "TimeoutError") {
          this.circuitBreaker.recordFailure();
          lastError = new PterodactylApiError(
            0,
            "TIMEOUT",
            `Request to panel API timed out after ${this.timeout}ms.`
          );
          continue;
        }
        if (this.isRetryableNetworkError(error)) {
          this.circuitBreaker.recordFailure();
          lastError = new PterodactylApiError(
            0,
            "NETWORK_ERROR",
            "Failed to connect to panel API. Check that the panel URL is correct and reachable."
          );
          continue;
        }
        throw new PterodactylApiError(
          0,
          "NETWORK_ERROR",
          "Failed to connect to panel API. Check that the panel URL is correct and reachable."
        );
      }
    }
    throw lastError ?? new PterodactylApiError(0, "API_ERROR", "Request failed after multiple retries.");
  }
};

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/tools/compress-files.ts
import { z } from "zod/v4";

// src/lib/errors.ts
function formatToolError(error) {
  if (error instanceof PterodactylApiError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error.code,
            message: error.message,
            status: error.status
          })
        }
      ],
      isError: true
    };
  }
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: "INTERNAL_ERROR", message })
      }
    ],
    isError: true
  };
}

// src/lib/response.ts
function formatToolResponse(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}

// src/tools/compress-files.ts
function registerCompressFilesTool(server, client) {
  server.registerTool(
    "compress_files",
    {
      description: "Compress one or more files or folders into a .tar.gz archive on the server. Useful before downloading large directories or for creating manual backups of specific files. Returns the archive details. Requires Client API key.",
      inputSchema: z.object({
        server_identifier: z.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z.string().describe("Directory containing the files to compress"),
        files: z.array(z.string()).min(1).describe("File/folder names to compress")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.compressFiles(
          params.server_identifier,
          params.directory,
          params.files
        );
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-allocation.ts
import { z as z2 } from "zod/v4";
function registerCreateAllocationTool(server, client) {
  server.registerTool(
    "create_allocation",
    {
      description: "Create new port allocations on a node (admin action). Ports can be individual ('25565') or ranges ('25565-25570'). Use list_nodes to find the node_id first. Requires Application API key.",
      inputSchema: z2.object({
        node_id: z2.number().int().positive().describe("Node ID to create allocations on (from list_nodes)"),
        ip: z2.string().min(1).describe("IP address to bind the allocation to (e.g. '0.0.0.0' or '192.168.1.1')"),
        ports: z2.array(z2.string().min(1)).min(1).describe("Array of ports or port ranges to allocate (e.g. ['25565', '25570-25575'])")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.createAllocation(params.node_id, params.ip, params.ports);
        return formatToolResponse({
          success: true,
          node_id: params.node_id,
          ip: params.ip,
          ports: params.ports
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-backup.ts
import { z as z3 } from "zod/v4";
function registerCreateBackupTool(server, client) {
  server.registerTool(
    "create_backup",
    {
      description: "Create a new backup of a server. The backup runs in the background and may take several minutes depending on server size. Use list_backups to check backup status and available slots. The server's backup limit (from list_servers feature_limits.backups) determines the maximum number of backups. Requires Client API key.",
      inputSchema: z3.object({
        server_identifier: z3.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        name: z3.string().optional().describe("Backup name (auto-generated if not provided)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createBackup(params.server_identifier, params.name);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-database.ts
import { z as z4 } from "zod/v4";
function registerCreateDatabaseTool(server, client) {
  server.registerTool(
    "create_database",
    {
      description: "Create a new MySQL database for a server. 'remote' controls which hosts can connect (% = any host). The server must have available database slots (check feature_limits.databases from list_servers). Use list_client_databases to see existing databases. Requires Client API key.",
      inputSchema: z4.object({
        server_identifier: z4.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        database: z4.string().min(1).describe("Name for the new database (will be prefixed with server ID by the panel)"),
        remote: z4.string().optional().describe(
          "Allowed remote connection host (default: '%' for any host). Use a specific IP to restrict access."
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createClientDatabase(params.server_identifier, {
          database: params.database,
          remote: params.remote ?? "%"
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          database: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-egg-variable.ts
import { z as z5 } from "zod/v4";
function registerCreateEggVariableTool(server, client) {
  server.registerTool(
    "create_egg_variable",
    {
      description: "Add a new environment variable to an egg (admin action). The 'rules' field uses Laravel validation syntax (e.g., 'required|string|max:20'). Use list_nests and list_eggs to find the nest_id and egg_id. Requires Application API key.",
      inputSchema: z5.object({
        nest_id: z5.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z5.number().int().positive().describe("Egg ID to add the variable to (from list_eggs)"),
        name: z5.string().min(1).describe("Display name for the variable (e.g. 'Server Port')"),
        description: z5.string().describe("Description of what this variable controls"),
        env_variable: z5.string().min(1).describe("Environment variable key (e.g. 'SERVER_PORT')"),
        default_value: z5.string().describe("Default value for the variable (e.g. '25565')"),
        user_viewable: z5.boolean().describe("Whether users can see this variable in the panel"),
        user_editable: z5.boolean().describe("Whether users can modify this variable in the panel"),
        rules: z5.string().min(1).describe(
          "Laravel validation rules (e.g. 'required|string|max:20', 'required|integer|between:1,65535')"
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createEggVariable(params.nest_id, params.egg_id, {
          name: params.name,
          description: params.description,
          env_variable: params.env_variable,
          default_value: params.default_value,
          user_viewable: params.user_viewable,
          user_editable: params.user_editable,
          rules: params.rules
        });
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-folder.ts
import { z as z6 } from "zod/v4";
function registerCreateFolderTool(server, client) {
  server.registerTool(
    "create_folder",
    {
      description: "Create a new directory/folder on a server's filesystem. Specify the parent directory and the new folder name. Use list_files to verify the parent directory exists first. Requires Client API key.",
      inputSchema: z6.object({
        server_identifier: z6.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z6.string().describe("Parent directory, e.g. /"),
        name: z6.string().min(1).describe("Folder name to create")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.createFolder(params.server_identifier, params.directory, params.name);
        return formatToolResponse({
          success: true,
          message: `Folder '${params.name}' created in ${params.directory} on server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          directory: params.directory,
          name: params.name
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-schedule.ts
import { z as z7 } from "zod/v4";
function registerCreateScheduleTool(server, client) {
  server.registerTool(
    "create_schedule",
    {
      description: "Create a scheduled task for a server (e.g., automatic restarts, backups). Uses cron syntax for timing. Use list_schedules to see existing schedules. Common examples: '0 */6 * * *' for every 6 hours, '0 3 * * *' for daily at 3 AM. Requires Client API key.",
      inputSchema: z7.object({
        server_identifier: z7.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        name: z7.string().min(1).describe("Display name for the schedule (e.g., 'Daily Restart')"),
        minute: z7.string().min(1).describe("Cron minute field (e.g., '0', '*/15', '0,30')"),
        hour: z7.string().min(1).describe("Cron hour field (e.g., '*', '3', '0,12')"),
        day_of_week: z7.string().min(1).describe("Cron day-of-week field (e.g., '*', '1-5' for Mon-Fri)"),
        day_of_month: z7.string().min(1).describe("Cron day-of-month field (e.g., '*', '1', '1,15')"),
        month: z7.string().min(1).describe("Cron month field (e.g., '*', '1-6')"),
        is_active: z7.boolean().optional().describe("Whether the schedule is active immediately (default: true)"),
        only_when_online: z7.boolean().optional().describe("Only run when the server is online (default: true)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createSchedule(params.server_identifier, {
          name: params.name,
          cron_minute: params.minute,
          cron_hour: params.hour,
          cron_day_of_week: params.day_of_week,
          cron_day_of_month: params.day_of_month,
          cron_month: params.month,
          is_active: params.is_active
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          schedule: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-schedule-task.ts
import { z as z8 } from "zod/v4";
function registerCreateScheduleTaskTool(server, client) {
  server.registerTool(
    "create_schedule_task",
    {
      description: "Add a task to a schedule. Actions: 'command' (console command), 'power' (start/stop/restart/kill), 'backup' (create backup). time_offset delays execution in seconds after the schedule triggers. Use get_schedule to see existing tasks on a schedule. Requires Client API key.",
      inputSchema: z8.object({
        server_identifier: z8.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        schedule_id: z8.number().int().positive().describe("Numeric schedule ID from list_schedules"),
        action: z8.enum(["command", "power", "backup"]).describe(
          "Task action type: 'command' runs a console command, 'power' sends a power signal, 'backup' creates a backup"
        ),
        payload: z8.string().describe(
          "Action payload: for 'command' the console command text, for 'power' one of start/stop/restart/kill, for 'backup' leave empty string"
        ),
        time_offset: z8.number().int().min(0).optional().describe(
          "Delay in seconds after the schedule triggers before running this task (default: 0)"
        ),
        continue_on_failure: z8.boolean().optional().describe(
          "If true, subsequent tasks will still run even if this task fails (default: false)"
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createScheduleTask(
          params.server_identifier,
          params.schedule_id,
          {
            action: params.action,
            payload: params.payload,
            time_offset: params.time_offset ?? 0,
            continue_on_failure: params.continue_on_failure
          }
        );
        return formatToolResponse({
          server_identifier: params.server_identifier,
          schedule_id: params.schedule_id,
          task: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-server.ts
import { z as z9 } from "zod/v4";
function registerCreateServerTool(server, client) {
  server.registerTool(
    "create_server",
    {
      description: "Create a new game server on the panel (admin action). Requires egg ID (from list_eggs), owner user ID (from list_users), allocation ID, and resource limits. Use list_eggs to find available server templates and list_nodes to find nodes with capacity. Requires Application API key.",
      inputSchema: z9.object({
        name: z9.string().min(1).describe("Server name"),
        user: z9.number().int().positive().describe("Owner user ID"),
        egg: z9.number().int().positive().describe("Egg ID (server template)"),
        docker_image: z9.string().min(1).describe("Docker image to use"),
        startup: z9.string().min(1).describe("Startup command"),
        memory: z9.number().int().positive().describe("Memory limit in MB"),
        disk: z9.number().int().positive().describe("Disk limit in MB"),
        cpu: z9.number().int().min(0).describe("CPU limit in percent (100 = 1 core)"),
        swap: z9.number().int().optional().default(0).describe("Swap limit in MB (default: 0)"),
        io: z9.number().int().optional().default(500).describe("IO weight (default: 500)"),
        databases_limit: z9.number().int().min(0).optional().default(0).describe("Max databases (default: 0)"),
        allocations_limit: z9.number().int().min(0).optional().default(0).describe("Max allocations (default: 0)"),
        backups_limit: z9.number().int().min(0).optional().default(0).describe("Max backups (default: 0)"),
        allocation_id: z9.number().int().positive().describe("Default allocation ID for the server"),
        environment: z9.record(z9.string(), z9.string()).optional().describe("Environment variables for the egg")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const body = {
          name: params.name,
          user: params.user,
          egg: params.egg,
          docker_image: params.docker_image,
          startup: params.startup,
          limits: {
            memory: params.memory,
            swap: params.swap,
            disk: params.disk,
            io: params.io,
            cpu: params.cpu
          },
          feature_limits: {
            databases: params.databases_limit,
            allocations: params.allocations_limit,
            backups: params.backups_limit
          },
          allocation: {
            default: params.allocation_id
          },
          environment: params.environment
        };
        const result = await client.createServer(body);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-subuser.ts
import { z as z10 } from "zod/v4";
function registerCreateSubuserTool(server, client) {
  server.registerTool(
    "create_subuser",
    {
      description: "Add a sub-user to a server by email. Permissions are strings like 'control.start', 'control.stop', 'control.restart', 'file.read', 'file.create', 'file.update', 'file.delete', 'backup.create', 'backup.read', 'database.read', etc. Use list_subusers to see existing sub-users. Requires Client API key.",
      inputSchema: z10.object({
        server_identifier: z10.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        email: z10.string().email().describe("Email address of the user to add as a sub-user"),
        permissions: z10.array(z10.string().min(1)).min(1).describe(
          "List of permission strings (e.g., ['control.start', 'control.stop', 'file.read'])"
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.createSubuser(params.server_identifier, {
          email: params.email,
          permissions: params.permissions
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          subuser: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/create-user.ts
import { z as z11 } from "zod/v4";
function registerCreateUserTool(server, client) {
  server.registerTool(
    "create_user",
    {
      description: "Create a new user account on the panel (admin action). The user can then be assigned as owner of servers via create_server or update_server_details. SECURITY WARNING: Setting root_admin to true grants FULL panel access. Requires Application API key.",
      inputSchema: z11.object({
        username: z11.string().min(1).describe("Username for the new account"),
        email: z11.string().email().describe("Email address"),
        password: z11.string().min(8).describe("Password (min 8 characters)"),
        root_admin: z11.boolean().optional().default(false).describe(
          "Whether the user is an admin (default: false). WARNING: root admins have full panel access."
        )
      }),
      annotations: {
        destructiveHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const result = await client.createUser({
          username: params.username,
          email: params.email,
          password: params.password,
          root_admin: params.root_admin
        });
        const response = { ...result };
        if (params.root_admin) {
          response.warning = "Created user with root admin privileges -- this grants full panel access including server creation, deletion, and user management.";
        }
        return formatToolResponse(response);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/decompress-file.ts
import { z as z12 } from "zod/v4";
function registerDecompressFileTool(server, client) {
  server.registerTool(
    "decompress_file",
    {
      description: "Extract/decompress an archive file (.tar.gz, .zip) on the server. Files are extracted into the same directory as the archive. Use list_files to verify the archive exists first. Requires Client API key.",
      inputSchema: z12.object({
        server_identifier: z12.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z12.string().describe("Directory containing the archive"),
        file: z12.string().min(1).describe("Archive filename to decompress")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.decompressFile(params.server_identifier, params.directory, params.file);
        return formatToolResponse({
          success: true,
          message: `Archive '${params.file}' decompressed in ${params.directory} on server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          directory: params.directory,
          file: params.file
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-allocation.ts
import { z as z13 } from "zod/v4";
function registerDeleteAllocationTool(server, client) {
  server.registerTool(
    "delete_allocation",
    {
      description: "Delete a port allocation from a node (admin action). Cannot delete allocations that are in use by a server. Use list_allocations to find the allocation_id. Requires Application API key.",
      inputSchema: z13.object({
        node_id: z13.number().int().positive().describe("Node ID that owns the allocation (from list_nodes)"),
        allocation_id: z13.number().int().positive().describe("Allocation ID to delete (from list_allocations)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteAllocation(params.node_id, params.allocation_id);
        return formatToolResponse({
          success: true,
          node_id: params.node_id,
          allocation_id: params.allocation_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-backup.ts
import { z as z14 } from "zod/v4";
function registerDeleteBackupTool(server, client) {
  server.registerTool(
    "delete_backup",
    {
      description: "Delete a backup from a server. This permanently removes the backup file and frees a backup slot. Use list_backups to find the backup UUID. Requires Client API key.",
      inputSchema: z14.object({
        server_identifier: z14.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        backup_uuid: z14.string().min(1).describe("UUID of the backup from list_backups")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteBackup(params.server_identifier, params.backup_uuid);
        return formatToolResponse({
          success: true,
          message: `Backup ${params.backup_uuid} has been deleted.`,
          server_identifier: params.server_identifier,
          backup_uuid: params.backup_uuid
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-database.ts
import { z as z15 } from "zod/v4";
function registerDeleteDatabaseTool(server, client) {
  server.registerTool(
    "delete_database",
    {
      description: "Delete a MySQL database from a server. WARNING: This permanently destroys the database and all its data. Use list_client_databases to find the database ID. Consider creating a backup first. Requires Client API key.",
      inputSchema: z15.object({
        server_identifier: z15.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        database_id: z15.string().min(1).describe("Database ID from list_client_databases")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteClientDatabase(params.server_identifier, params.database_id);
        return formatToolResponse({
          success: true,
          message: `Database ${params.database_id} has been deleted.`,
          server_identifier: params.server_identifier,
          database_id: params.database_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-egg.ts
import { z as z16 } from "zod/v4";
function registerDeleteEggTool(server, client) {
  server.registerTool(
    "delete_egg",
    {
      description: "Permanently delete an egg/server template from a nest (admin action). WARNING: Servers currently using this egg will NOT be deleted but may not start correctly after the egg is removed. This action cannot be undone. Use get_egg to verify the egg before deleting. Requires Application API key.",
      inputSchema: z16.object({
        nest_id: z16.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z16.number().int().positive().describe("Egg ID to delete (from list_eggs)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteEgg(params.nest_id, params.egg_id);
        return formatToolResponse({
          success: true,
          message: `Egg ${params.egg_id} has been deleted from nest ${params.nest_id}.`,
          nest_id: params.nest_id,
          egg_id: params.egg_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-egg-variable.ts
import { z as z17 } from "zod/v4";
function registerDeleteEggVariableTool(server, client) {
  server.registerTool(
    "delete_egg_variable",
    {
      description: "Delete an environment variable from an egg (admin action). This is permanent and cannot be undone. Use list_egg_variables to find the variable_id. Requires Application API key.",
      inputSchema: z17.object({
        nest_id: z17.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z17.number().int().positive().describe("Egg ID that contains the variable (from list_eggs)"),
        variable_id: z17.number().int().positive().describe("Variable ID to delete (from list_egg_variables)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteEggVariable(params.nest_id, params.egg_id, params.variable_id);
        return formatToolResponse({
          success: true,
          nest_id: params.nest_id,
          egg_id: params.egg_id,
          variable_id: params.variable_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-files.ts
import { z as z18 } from "zod/v4";
function registerDeleteFilesTool(server, client) {
  server.registerTool(
    "delete_files",
    {
      description: "Permanently delete one or more files or folders on a server. WARNING: This cannot be undone. Use list_files first to verify the files exist. Consider create_backup before deleting important files. Requires Client API key.",
      inputSchema: z18.object({
        server_identifier: z18.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z18.string().describe("Parent directory containing the files"),
        files: z18.array(z18.string()).min(1).describe("File/folder names to delete")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteFiles(params.server_identifier, params.directory, params.files);
        return formatToolResponse({
          success: true,
          message: `Deleted ${params.files.length} item(s) from ${params.directory} on server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          directory: params.directory,
          deleted: params.files
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-schedule.ts
import { z as z19 } from "zod/v4";
function registerDeleteScheduleTool(server, client) {
  server.registerTool(
    "delete_schedule",
    {
      description: "Delete a scheduled task from a server. This removes the schedule and all its associated tasks permanently. Use list_schedules to find the schedule_id. Requires Client API key.",
      inputSchema: z19.object({
        server_identifier: z19.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        schedule_id: z19.number().int().positive().describe("Numeric schedule ID from list_schedules")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteSchedule(params.server_identifier, params.schedule_id);
        return formatToolResponse({
          success: true,
          message: `Schedule ${params.schedule_id} has been deleted.`,
          server_identifier: params.server_identifier,
          schedule_id: params.schedule_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-schedule-task.ts
import { z as z20 } from "zod/v4";
function registerDeleteScheduleTaskTool(server, client) {
  server.registerTool(
    "delete_schedule_task",
    {
      description: "Remove a task from a schedule. Use get_schedule to see the tasks and their IDs on a schedule before deleting. Requires Client API key.",
      inputSchema: z20.object({
        server_identifier: z20.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        schedule_id: z20.number().int().positive().describe("Numeric schedule ID from list_schedules"),
        task_id: z20.number().int().positive().describe("Numeric task ID from get_schedule tasks list")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteScheduleTask(
          params.server_identifier,
          params.schedule_id,
          params.task_id
        );
        return formatToolResponse({
          success: true,
          message: `Task ${params.task_id} has been removed from schedule ${params.schedule_id}.`,
          server_identifier: params.server_identifier,
          schedule_id: params.schedule_id,
          task_id: params.task_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-server.ts
import { z as z21 } from "zod/v4";
function registerDeleteServerTool(server, client) {
  server.registerTool(
    "delete_server",
    {
      description: "Permanently delete a server and ALL its data including files, databases, and backups (admin action). WARNING: This action cannot be undone. The server will be removed from the panel entirely. Consider create_backup before proceeding. Requires Application API key.",
      inputSchema: z21.object({
        server_id: z21.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteServer(params.server_id);
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_id} has been deleted.`,
          server_id: params.server_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/delete-subuser.ts
import { z as z22 } from "zod/v4";
function registerDeleteSubuserTool(server, client) {
  server.registerTool(
    "delete_subuser",
    {
      description: "Remove a sub-user's access to a server. This revokes all their permissions immediately. Use list_subusers to find the user UUID. Requires Client API key.",
      inputSchema: z22.object({
        server_identifier: z22.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        user_uuid: z22.string().min(1).describe("UUID of the sub-user to remove from list_subusers")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.deleteSubuser(params.server_identifier, params.user_uuid);
        return formatToolResponse({
          success: true,
          message: `Sub-user ${params.user_uuid} has been removed from the server.`,
          server_identifier: params.server_identifier,
          user_uuid: params.user_uuid
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/download-backup.ts
import { z as z23 } from "zod/v4";
function registerDownloadBackupTool(server, client) {
  server.registerTool(
    "download_backup",
    {
      description: "Get a temporary download URL for a backup. The URL expires after a short time. Use list_backups to find the backup UUID. Only completed backups (is_successful: true) can be downloaded. Requires Client API key.",
      inputSchema: z23.object({
        server_identifier: z23.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        backup_uuid: z23.string().min(1).describe("UUID of the backup from list_backups")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.downloadBackup(params.server_identifier, params.backup_uuid);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          backup_uuid: params.backup_uuid,
          download_url: result.url
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/download-file.ts
import { z as z24 } from "zod/v4";
function registerDownloadFileTool(server, client) {
  server.registerTool(
    "download_file",
    {
      description: "Get a temporary download URL for a file on the server. Useful for large files or binaries that can't be read as text. The URL expires after a short time. Use list_files to find file paths. For small text files, use read_file instead. Requires Client API key.",
      inputSchema: z24.object({
        server_identifier: z24.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        file_path: z24.string().min(1).describe(
          "Absolute path to the file on the server (e.g., '/server.jar', '/logs/latest.log')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.downloadFile(params.server_identifier, params.file_path);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          file_path: params.file_path,
          download_url: result.url
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/export-egg.ts
import { z as z25 } from "zod/v4";
function registerExportEggTool(server, client) {
  server.registerTool(
    "export_egg",
    {
      description: "Export an egg as JSON that can be imported into another Pterodactyl panel (admin action). Returns the complete egg configuration including variables, install script, and Docker settings in the standard Pterodactyl egg export format. Use list_nests and list_eggs to find the nest_id and egg_id. Requires Application API key.",
      inputSchema: z25.object({
        nest_id: z25.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z25.number().int().positive().describe("Egg ID to export (from list_eggs)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const egg = await client.getEgg(params.nest_id, params.egg_id);
        const exportData = {
          _comment: "DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY PTERODACTYL PANEL",
          meta: {
            version: "PTDL_v2",
            update_url: null
          },
          exported_at: (/* @__PURE__ */ new Date()).toISOString(),
          name: egg.name,
          author: egg.author,
          description: egg.description,
          features: null,
          docker_images: egg.docker_images,
          file_denylist: [],
          startup: egg.startup,
          config: {
            files: egg.config_files,
            startup: egg.config_startup,
            logs: egg.config_logs,
            stop: egg.config_stop
          },
          scripts: {
            installation: {
              script: egg.script_install,
              container: egg.script_container,
              entrypoint: egg.script_entry
            }
          },
          variables: (egg.variables ?? []).map((v) => ({
            name: v.name,
            description: v.description,
            env_variable: v.env_variable,
            default_value: v.default_value,
            user_viewable: v.user_viewable,
            user_editable: v.user_editable,
            rules: v.rules
          }))
        };
        return formatToolResponse(exportData);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-account.ts
import { z as z26 } from "zod/v4";
function registerGetAccountTool(server, client) {
  server.registerTool(
    "get_account",
    {
      description: "Get the current authenticated user's account information (username, email, admin status, language). Use to verify which account the Client API key belongs to. Requires Client API key.",
      inputSchema: z26.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      try {
        const account = await client.getAccount();
        return formatToolResponse(account);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-egg.ts
import { z as z27 } from "zod/v4";
function registerGetEggTool(server, client) {
  server.registerTool(
    "get_egg",
    {
      description: "Get full details of a specific egg/server template (admin action). Returns name, Docker image, startup command, install script, configuration, and all environment variables with their default values and validation rules. Use list_nests to find the nest_id and list_eggs to find the egg_id. Requires Application API key.",
      inputSchema: z27.object({
        nest_id: z27.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z27.number().int().positive().describe("Egg ID to retrieve (from list_eggs)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const egg = await client.getEgg(params.nest_id, params.egg_id);
        return formatToolResponse(egg);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-nest.ts
import { z as z28 } from "zod/v4";
function registerGetNestTool(server, client) {
  server.registerTool(
    "get_nest",
    {
      description: "Get details of a specific nest (egg category) by ID (admin action). Returns name, description, author, and metadata. Use list_nests to find the nest_id. Requires Application API key.",
      inputSchema: z28.object({
        nest_id: z28.number().int().positive().describe("Nest ID to retrieve (from list_nests)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const nest = await client.getNest(params.nest_id);
        return formatToolResponse(nest);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-node.ts
import { z as z29 } from "zod/v4";
function registerGetNodeTool(server, client) {
  server.registerTool(
    "get_node",
    {
      description: "Get detailed information about a specific infrastructure node (admin action). Returns name, FQDN, resource limits, allocated resources, scheme, and maintenance status. Use list_nodes to find the node ID first. Requires Application API key.",
      inputSchema: z29.object({
        node_id: z29.number().int().positive().describe("Node numeric ID (from list_nodes)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.getNode(params.node_id);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-node-config.ts
import { z as z30 } from "zod/v4";

// src/lib/sanitize.ts
var MAX_COMMAND_LENGTH = 1e3;
var DANGEROUS_PATTERNS = [
  { pattern: /\bop\s+/i, reason: "Grants operator (admin) privileges to a player" },
  { pattern: /\bdeop\s+/i, reason: "Removes operator privileges from a player" },
  { pattern: /\bstop\b/i, reason: "Stops the server process" },
  { pattern: /\bend\b/i, reason: "Stops the server process" },
  { pattern: /\bban\s+/i, reason: "Bans a player from the server" },
  { pattern: /\bban-ip\s+/i, reason: "Bans an IP address from the server" },
  { pattern: /\bpardon\s+/i, reason: "Unbans a player from the server" },
  { pattern: /\bwhitelist\s+(off|clear)\b/i, reason: "Disables or clears the server whitelist" },
  { pattern: /\bkick\s+/i, reason: "Kicks a player from the server" },
  { pattern: /\bfill\s+/i, reason: "Fills a region with blocks (can cause lag)" },
  { pattern: /\bclone\s+/i, reason: "Clones a region of blocks (can cause lag)" },
  { pattern: /\bsetblock\s+/i, reason: "Modifies world blocks" },
  { pattern: /\brcon\b/i, reason: "RCON command - may execute arbitrary server commands" },
  { pattern: /\bsave-off\b/i, reason: "Disables world auto-save" },
  {
    pattern: /\bexecute\b.*\brun\b/i,
    reason: "Execute-run chain - runs commands as other entities"
  },
  { pattern: /\bscoreboard\b.*\bplayers\b.*\bset\b/i, reason: "Modifies player scoreboard data" },
  { pattern: /[;&|`$]/, reason: "Contains shell metacharacters" },
  { pattern: /\0/, reason: "Contains null bytes" }
];
function sanitizeCommand(command) {
  return command.replace(/\x00/g, "").trim().slice(0, MAX_COMMAND_LENGTH);
}
function checkCommandSafety(command) {
  const warnings = [];
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(reason);
    }
  }
  return {
    safe: warnings.length === 0,
    warnings
  };
}
var SENSITIVE_FIELD_PATTERNS = ["token", "secret", "password", "key", "daemon_token", "remote"];
var REDACTED = "[REDACTED]";
function isSensitiveFieldName(fieldName) {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => lower.includes(pattern));
}
function filterSensitiveFields(obj, additionalFields = []) {
  if (obj === null || obj === void 0) {
    return obj;
  }
  if (typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => filterSensitiveFields(item, additionalFields));
  }
  const result = {};
  const record = obj;
  for (const [key, value] of Object.entries(record)) {
    const isAdditionalSensitive = additionalFields.some(
      (f) => key.toLowerCase() === f.toLowerCase()
    );
    if (isSensitiveFieldName(key) || isAdditionalSensitive) {
      result[key] = REDACTED;
    } else if (typeof value === "object" && value !== null) {
      result[key] = filterSensitiveFields(value, additionalFields);
    } else {
      result[key] = value;
    }
  }
  return result;
}
var SENSITIVE_ENV_PATTERNS = ["password", "token", "secret", "key", "api", "auth", "credential"];
function maskEnvironmentVariables(env) {
  const masked = {};
  for (const [name, value] of Object.entries(env)) {
    const lower = name.toLowerCase();
    const isSensitive = SENSITIVE_ENV_PATTERNS.some((pattern) => lower.includes(pattern));
    if (isSensitive && typeof value === "string") {
      masked[name] = REDACTED;
    } else {
      masked[name] = value;
    }
  }
  return masked;
}

// src/tools/get-node-config.ts
function registerGetNodeConfigTool(server, client) {
  server.registerTool(
    "get_node_config",
    {
      description: "Get the Wings daemon configuration for a node (admin action). Returns the config.yml content needed to configure the Wings daemon. Sensitive fields (tokens, keys) are redacted. Use when setting up or troubleshooting a node. Requires Application API key.",
      inputSchema: z30.object({
        node_id: z30.number().int().positive().describe("Node numeric ID (from list_nodes)")
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const result = await client.getNodeConfiguration(params.node_id);
        const filtered = filterSensitiveFields(result, ["daemon_token", "remote"]);
        return formatToolResponse(filtered);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-recent-logs.ts
import { z as z31 } from "zod/v4";
var DEFAULT_LINES = 100;
var MAX_LINES = 500;
var DEFAULT_LOG_PATH = "/logs/latest.log";
function registerGetRecentLogsTool(server, client) {
  server.registerTool(
    "get_recent_logs",
    {
      description: "Read the most recent log lines from a server. Defaults to reading /logs/latest.log (Minecraft). For other server types, specify the log file path. Returns the last N lines. Use this after send_command to check the server's response, or to diagnose crashes and errors. Requires Client API key.",
      inputSchema: z31.object({
        server_identifier: z31.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        lines: z31.number().int().min(1).max(MAX_LINES).optional().describe(
          `Number of recent lines to return (default: ${DEFAULT_LINES}, max: ${MAX_LINES})`
        ),
        file_path: z31.string().min(1).optional().describe(
          "Path to the log file (default: '/logs/latest.log'). Common paths: '/logs/latest.log' (Minecraft), '/console.log', '/logs/output.log'"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const logPath = params.file_path ?? DEFAULT_LOG_PATH;
        const lineCount = params.lines ?? DEFAULT_LINES;
        const content = await client.readFile(params.server_identifier, logPath);
        const allLines = content.split("\n");
        const lastLines = allLines.slice(-lineCount);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          file: logPath,
          total_lines: allLines.length,
          returned_lines: lastLines.length,
          content: lastLines.join("\n")
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-schedule.ts
import { z as z32 } from "zod/v4";
function registerGetScheduleTool(server, client) {
  server.registerTool(
    "get_schedule",
    {
      description: "Get details of a specific scheduled task for a server, including its tasks (actions). Returns schedule name, cron expression, active status, last/next run times, and all associated tasks. Use list_schedules first to find schedule IDs. Requires Client API key.",
      inputSchema: z32.object({
        server_identifier: z32.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        schedule_id: z32.number().int().positive().describe("Numeric schedule ID from list_schedules")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.getSchedule(params.server_identifier, params.schedule_id);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          schedule: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-server.ts
import { z as z33 } from "zod/v4";
function registerGetServerTool(server, client) {
  server.registerTool(
    "get_server",
    {
      description: "Get detailed static configuration for a server: name, description, resource limits, container config (egg, Docker image, startup command), allocations, and timestamps. Use for server config inspection. For live resource usage (CPU/RAM/disk), use get_server_resources instead. Sensitive environment variables are masked. Requires Application API key.",
      inputSchema: z33.object({
        server_id: z33.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const result = await client.getServer(params.server_id);
        const sanitized = { ...result };
        const container = sanitized.container;
        if (container?.environment && typeof container.environment === "object") {
          sanitized.container = {
            ...container,
            environment: maskEnvironmentVariables(container.environment)
          };
        }
        return formatToolResponse(sanitized);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-server-activity.ts
import { z as z34 } from "zod/v4";
function registerGetServerActivityTool(server, client) {
  server.registerTool(
    "get_server_activity",
    {
      description: "Get the activity/audit log for a server. Shows events like starts, stops, file edits, commands sent, and user actions. Useful for tracking what happened on a server. This endpoint may not be available on all Pterodactyl versions. Requires Client API key.",
      inputSchema: z34.object({
        server_identifier: z34.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        page: z34.number().int().positive().optional().describe("Page number for pagination (default: 1)"),
        per_page: z34.number().int().min(1).max(100).optional().describe("Items per page (default: 50, max: 100)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.getServerActivity(params.server_identifier, {
          page: params.page,
          per_page: params.per_page
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          activities: result.activities,
          count: result.activities.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-server-resources.ts
import { z as z35 } from "zod/v4";
function registerGetServerResourcesTool(server, client) {
  server.registerTool(
    "get_server_resources",
    {
      description: "Get real-time CPU, memory, disk, network usage and current power state (running/stopped/starting/stopping) for a server. Use when asked about performance, lag, resource consumption, or uptime. For static config details (limits, egg, allocations), use get_server instead. Requires Client API key.",
      inputSchema: z35.object({
        server_identifier: z35.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const resources = await client.getServerResources(params.server_identifier);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          state: resources.current_state,
          is_suspended: resources.is_suspended,
          cpu_percent: resources.resources.cpu_absolute,
          memory_mb: Math.round(resources.resources.memory_bytes / 1048576),
          disk_mb: Math.round(resources.resources.disk_bytes / 1048576),
          network_rx_mb: Math.round(resources.resources.network_rx_bytes / 1048576),
          network_tx_mb: Math.round(resources.resources.network_tx_bytes / 1048576),
          uptime_seconds: resources.resources.uptime
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-startup-variables.ts
import { z as z36 } from "zod/v4";
function registerGetStartupVariablesTool(server, client) {
  server.registerTool(
    "get_startup_variables",
    {
      description: "Get startup configuration for a server: startup command, environment variables, and available Docker images. Use to inspect or troubleshoot server startup parameters. For modifying startup config (admin), use update_server_startup instead. Requires Client API key.",
      inputSchema: z36.object({
        server_identifier: z36.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const startup = await client.getStartupVariables(params.server_identifier);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          ...startup
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/get-user.ts
import { z as z37 } from "zod/v4";
function registerGetUserTool(server, client) {
  server.registerTool(
    "get_user",
    {
      description: "Get detailed information for a specific user account by numeric ID (admin action). Returns username, email, language, admin status, and timestamps. Use list_users to find the user ID first. Requires Application API key.",
      inputSchema: z37.object({
        user_id: z37.number().int().positive().describe("User numeric ID")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.getUser(params.user_id);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/import-egg.ts
import { z as z38 } from "zod/v4";
function registerImportEggTool(server, client) {
  server.registerTool(
    "import_egg",
    {
      description: "Import or create a new egg (server template) in a nest (admin action). Eggs define the Docker image, startup command, and configuration for a type of game server. Use list_nests to find the nest_id first. The egg will be available for creating new servers via create_server. Requires Application API key.",
      inputSchema: z38.object({
        nest_id: z38.number().int().positive().describe("Nest ID to create the egg in (from list_nests)"),
        name: z38.string().min(1).describe("Display name for the egg"),
        description: z38.string().optional().describe("Description of what this egg runs"),
        docker_image: z38.string().min(1).describe("Docker image to use (e.g. 'ghcr.io/image:tag')"),
        startup: z38.string().min(1).describe(
          "Startup command with variable placeholders (e.g. 'java -jar {{SERVER_JARFILE}}')"
        ),
        config_from: z38.number().int().positive().optional().describe("Egg ID to inherit configuration from"),
        config_stop: z38.string().optional().describe("Stop command sent to the server process"),
        config_logs: z38.string().optional().describe("JSON config for log parsing"),
        config_files: z38.string().optional().describe("JSON config for file parser modifications"),
        config_startup: z38.string().optional().describe("JSON config for startup detection"),
        script_container: z38.string().optional().describe("Docker image for the install script (e.g. 'alpine:3.4')"),
        script_entry: z38.string().optional().describe("Entrypoint for the install script (e.g. 'bash')"),
        script_install: z38.string().optional().describe("Shell script executed during server installation")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const body = {
          name: params.name,
          docker_image: params.docker_image,
          startup: params.startup
        };
        if (params.description !== void 0) body.description = params.description;
        if (params.config_from !== void 0) body.config_from = params.config_from;
        if (params.config_stop !== void 0) body.config_stop = params.config_stop;
        if (params.config_logs !== void 0) body.config_logs = params.config_logs;
        if (params.config_files !== void 0) body.config_files = params.config_files;
        if (params.config_startup !== void 0) body.config_startup = params.config_startup;
        if (params.script_container !== void 0) body.script_container = params.script_container;
        if (params.script_entry !== void 0) body.script_entry = params.script_entry;
        if (params.script_install !== void 0) body.script_install = params.script_install;
        const result = await client.importEgg(params.nest_id, body);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/kill-server.ts
import { z as z39 } from "zod/v4";
function registerKillServerTool(server, client) {
  server.registerTool(
    "kill_server",
    {
      description: "Forcefully kill a server process immediately. WARNING: Unsaved data will be lost. Only use when stop_server fails or the server is frozen and unresponsive. Prefer stop_server for graceful shutdown. Requires Client API key.",
      inputSchema: z39.object({
        server_identifier: z39.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.killServer(params.server_identifier);
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_identifier} has been forcefully killed.`,
          server_identifier: params.server_identifier
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-allocations.ts
import { z as z40 } from "zod/v4";
function registerListAllocationsTool(server, client) {
  server.registerTool(
    "list_allocations",
    {
      description: "List all port allocations for a node (admin action). Shows IP, port, alias, and which server is using each allocation. Use list_nodes to find the node_id first. Requires Application API key.",
      inputSchema: z40.object({
        node_id: z40.number().int().positive().describe("Node ID to list allocations for (from list_nodes)"),
        page: z40.number().int().positive().optional().describe("Page number for pagination (default: 1)"),
        per_page: z40.number().int().min(1).max(100).optional().describe("Items per page (default: 50, max: 100)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listAllocations(params.node_id, {
          page: params.page,
          per_page: params.per_page
        });
        return formatToolResponse({
          node_id: params.node_id,
          allocations: result.allocations,
          count: result.allocations.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-backups.ts
import { z as z41 } from "zod/v4";
function registerListBackupsTool(server, client) {
  server.registerTool(
    "list_backups",
    {
      description: "List all backups for a server. Returns backup UUID, name, size, success status, lock status, and creation timestamps. Use before create_backup to check if backup limit is reached. Requires Client API key.",
      inputSchema: z41.object({
        server_identifier: z41.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const backups = await client.listBackups(params.server_identifier);
        const formatted = backups.map((b) => ({
          uuid: b.uuid,
          name: b.name,
          size_mb: Math.round(b.bytes / 1048576),
          is_successful: b.is_successful,
          is_locked: b.is_locked,
          created_at: b.created_at,
          completed_at: b.completed_at
        }));
        return formatToolResponse({
          server_identifier: params.server_identifier,
          backups: formatted,
          count: formatted.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-client-databases.ts
import { z as z42 } from "zod/v4";
function registerListClientDatabasesTool(server, client) {
  server.registerTool(
    "list_client_databases",
    {
      description: "List databases attached to a server from the client/user perspective. Returns database name, host, and connection details. For admin-level database management, use list_server_databases instead. Requires Client API key.",
      inputSchema: z42.object({
        server_identifier: z42.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listClientDatabases(params.server_identifier);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          databases: result.databases,
          count: result.databases.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-egg-variables.ts
import { z as z43 } from "zod/v4";
function registerListEggVariablesTool(server, client) {
  server.registerTool(
    "list_egg_variables",
    {
      description: "List all environment variables defined for an egg (admin action). Shows name, env_variable key, default value, validation rules, and user editability. On Pelican panels, use nest_id=0. Requires Application API key.",
      inputSchema: z43.object({
        nest_id: z43.number().int().min(0).describe("Nest ID (from list_nests). Use 0 for Pelican panels."),
        egg_id: z43.number().int().positive().describe("Egg ID to list variables for (from list_eggs)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        let variables;
        try {
          const result = await client.listEggVariables(params.nest_id, params.egg_id);
          variables = result.variables;
        } catch {
          const egg = await client.getEgg(params.nest_id, params.egg_id);
          variables = egg.relationships?.variables?.data.map((v) => v.attributes) ?? [];
        }
        return formatToolResponse({
          egg_id: params.egg_id,
          variables,
          count: variables.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-eggs.ts
import { z as z44 } from "zod/v4";
function registerListEggsTool(server, client) {
  server.registerTool(
    "list_eggs",
    {
      description: "List all available eggs/server templates on the panel (admin action). Returns egg ID, name, description, Docker images, and startup command. Use to find the egg ID needed for create_server. Common eggs: Minecraft, Rust, Terraria, etc. Requires Application API key.",
      inputSchema: z44.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      try {
        const result = await client.listEggs();
        return formatToolResponse({
          eggs: result.eggs,
          count: result.eggs.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-files.ts
import { z as z45 } from "zod/v4";
function registerListFilesTool(server, client) {
  server.registerTool(
    "list_files",
    {
      description: "List files and directories in a server's filesystem. Returns name, size, type (file/directory), and modification timestamps. Use to browse server files before reading or editing them. Start with directory '/' to see root contents. Requires Client API key.",
      inputSchema: z45.object({
        server_identifier: z45.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z45.string().optional().describe("Directory path to list (default: '/')")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const files = await client.listFiles(params.server_identifier, params.directory);
        const formatted = files.map((f) => ({
          name: f.name,
          type: f.is_file ? "file" : "directory",
          size_bytes: f.size,
          mimetype: f.mimetype,
          modified_at: f.modified_at
        }));
        return formatToolResponse({
          server_identifier: params.server_identifier,
          directory: params.directory ?? "/",
          files: formatted,
          count: formatted.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-mounts.ts
import { z as z46 } from "zod/v4";
function registerListMountsTool(server, client) {
  server.registerTool(
    "list_mounts",
    {
      description: "List all mount points configured on the panel (admin action). Returns mount name, source path, target path, and read-only status. Mounts allow sharing host directories with server containers. Requires Application API key.",
      inputSchema: z46.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      try {
        const result = await client.listMounts();
        return formatToolResponse({
          mounts: result.mounts,
          count: result.mounts.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-nests.ts
import { z as z47 } from "zod/v4";
function registerListNestsTool(server, client) {
  server.registerTool(
    "list_nests",
    {
      description: "List all nests (egg categories) on the panel (admin action). Nests group related eggs together (e.g. 'Minecraft', 'Voice Servers', 'Rust'). Returns nest ID, name, author, and description. Use the nest ID with list_eggs or get_egg to find specific server templates. Requires Application API key.",
      inputSchema: z47.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      try {
        const result = await client.listNests();
        return formatToolResponse({
          nests: result.nests,
          count: result.nests.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-nodes.ts
import { z as z48 } from "zod/v4";

// src/lib/pagination.ts
function formatPagination(raw) {
  return {
    current_page: raw.current_page,
    total_pages: raw.total_pages,
    total: raw.total,
    per_page: raw.per_page,
    has_next: raw.current_page < raw.total_pages,
    has_previous: raw.current_page > 1
  };
}

// src/tools/list-nodes.ts
function registerListNodesTool(server, client) {
  server.registerTool(
    "list_nodes",
    {
      description: "List all infrastructure nodes in the panel (admin action). Returns node ID, name, FQDN, total/allocated resources (memory, disk, CPU), and maintenance mode status. Use to check available capacity before creating servers. Supports pagination. Requires Application API key.",
      inputSchema: z48.object({
        page: z48.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z48.number().int().min(1).max(100).optional().describe("Items per page (default: 50, max: 100)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listNodes(params);
        const nodes = result.nodes.map((n) => ({
          id: n.id,
          uuid: n.uuid,
          name: n.name,
          description: n.description,
          fqdn: n.fqdn,
          scheme: n.scheme,
          memory_mb: n.memory,
          disk_mb: n.disk,
          cpu_percent: n.cpu,
          maintenance_mode: n.maintenance_mode,
          allocated: n.allocated_resources
        }));
        return formatToolResponse({
          nodes,
          pagination: formatPagination(result.pagination)
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-roles.ts
import { z as z49 } from "zod/v4";
function registerListRolesTool(server, client) {
  server.registerTool(
    "list_roles",
    {
      description: "List all admin roles defined on the panel (admin action). Returns role ID, name, and timestamps. Roles control admin panel access permissions. Requires Application API key.",
      inputSchema: z49.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      try {
        const result = await client.listRoles();
        return formatToolResponse({
          roles: result.roles,
          count: result.roles.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-schedules.ts
import { z as z50 } from "zod/v4";
function registerListSchedulesTool(server, client) {
  server.registerTool(
    "list_schedules",
    {
      description: "List all scheduled tasks (cron jobs) for a server. Returns schedule name, cron expression, active status, and last/next run times. Use to check automated restarts, backups, or command schedules. Requires Client API key.",
      inputSchema: z50.object({
        server_identifier: z50.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listSchedules(params.server_identifier);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          schedules: result.schedules,
          count: result.schedules.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-server-databases.ts
import { z as z51 } from "zod/v4";
function registerListServerDatabasesTool(server, client) {
  server.registerTool(
    "list_server_databases",
    {
      description: "List databases attached to a server from the admin perspective (admin action). Returns database host, name, and connection details. For client-level database access, use list_client_databases instead. Requires Application API key.",
      inputSchema: z51.object({
        server_id: z51.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listServerDatabases(params.server_id);
        return formatToolResponse({
          server_id: params.server_id,
          databases: result.databases,
          count: result.databases.length,
          pagination: result.pagination
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-servers.ts
import { z as z52 } from "zod/v4";

// src/lib/status.ts
function mapServerStatus(status) {
  if (status === null) {
    return "normal";
  }
  return status;
}

// src/tools/list-servers.ts
function registerListServersTool(server, client) {
  server.registerTool(
    "list_servers",
    {
      description: "List all game servers on the Pterodactyl panel with name, status, and resource limits. Call this first to discover server IDs and identifiers. Returns numeric 'id' (for admin tools like suspend_server, delete_server, update_server_build) and short 'identifier' (for client tools like start_server, send_command, list_files). Supports pagination. Requires Application API key.",
      inputSchema: z52.object({
        page: z52.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z52.number().int().min(1).max(100).optional().describe("Items per page (default: 50, max: 100)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listServers(params);
        const servers = result.servers.map((s) => ({
          id: s.id,
          identifier: s.identifier,
          name: s.name,
          status: mapServerStatus(s.status),
          suspended: s.suspended,
          limits: {
            memory_mb: s.limits.memory,
            disk_mb: s.limits.disk,
            cpu_percent: s.limits.cpu
          },
          node: s.node,
          user: s.user
        }));
        return formatToolResponse({
          servers,
          pagination: formatPagination(result.pagination)
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-subusers.ts
import { z as z53 } from "zod/v4";
function registerListSubusersTool(server, client) {
  server.registerTool(
    "list_subusers",
    {
      description: "List all sub-users who have access to a specific server, including their permissions. Returns UUID, username, email, and permission list for each sub-user. Use to audit who has access to a server. Requires Client API key.",
      inputSchema: z53.object({
        server_identifier: z53.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listSubusers(params.server_identifier);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          subusers: result.users,
          count: result.users.length
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/list-users.ts
import { z as z54 } from "zod/v4";
function registerListUsersTool(server, client) {
  server.registerTool(
    "list_users",
    {
      description: "List all user accounts registered on the panel (admin action). Returns user ID, username, email, language, and admin status. Use to find user IDs needed for create_server (owner) or update_server_details. Supports pagination. Requires Application API key.",
      inputSchema: z54.object({
        page: z54.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z54.number().int().min(1).max(100).optional().describe("Items per page (default: 50, max: 100)")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.listUsers(params);
        const users = result.users.map((u) => ({
          id: u.id,
          uuid: u.uuid,
          username: u.username,
          email: u.email,
          language: u.language,
          root_admin: u.root_admin
        }));
        return formatToolResponse({
          users,
          pagination: formatPagination(result.pagination)
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/read-file.ts
import { z as z55 } from "zod/v4";
function registerReadFileTool(server, client) {
  server.registerTool(
    "read_file",
    {
      description: "Read the contents of a text file on a server. Returns the raw file content as a string. Use list_files first to find the file path. Common files: /server.properties, /bukkit.yml, /config.yml. Not suitable for binary files. Requires Client API key.",
      inputSchema: z55.object({
        server_identifier: z55.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        file_path: z55.string().min(1).describe("Absolute path to the file, e.g. /server.properties")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const content = await client.readFile(params.server_identifier, params.file_path);
        return formatToolResponse({
          server_identifier: params.server_identifier,
          file_path: params.file_path,
          content
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/reinstall-server.ts
import { z as z56 } from "zod/v4";
function registerReinstallServerTool(server, client) {
  server.registerTool(
    "reinstall_server",
    {
      description: "Reinstall a server's egg/template (admin action). WARNING: This wipes ALL server files and reinstalls from scratch. All player data, configs, and world files will be permanently deleted. Consider create_backup before proceeding. Requires Application API key.",
      inputSchema: z56.object({
        server_id: z56.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.reinstallServer(params.server_id);
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_id} reinstall initiated.`,
          server_id: params.server_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/rename-file.ts
import { z as z57 } from "zod/v4";
function registerRenameFileTool(server, client) {
  server.registerTool(
    "rename_file",
    {
      description: "Rename or move a file or folder on a server. Can be used to change a filename or move a file to a different location within the same directory root. Use list_files to verify the file exists first. Requires Client API key.",
      inputSchema: z57.object({
        server_identifier: z57.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        directory: z57.string().describe("Directory containing the file"),
        from: z57.string().min(1).describe("Current file/folder name"),
        to: z57.string().min(1).describe("New file/folder name")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.renameFile(params.server_identifier, params.directory, params.from, params.to);
        return formatToolResponse({
          success: true,
          message: `Renamed '${params.from}' to '${params.to}' in ${params.directory} on server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          directory: params.directory,
          from: params.from,
          to: params.to
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/restart-server.ts
import { z as z58 } from "zod/v4";
function registerRestartServerTool(server, client) {
  server.registerTool(
    "restart_server",
    {
      description: "Restart a game server. Works whether the server is running or stopped. Equivalent to stop + start. Use when a config change requires a restart or when the server is unresponsive. Idempotent. Requires Client API key.",
      inputSchema: z58.object({
        server_identifier: z58.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.sendPowerAction(params.server_identifier, "restart");
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_identifier} is restarting.`,
          server_identifier: params.server_identifier,
          action: "restart"
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/restore-backup.ts
import { z as z59 } from "zod/v4";
function registerRestoreBackupTool(server, client) {
  server.registerTool(
    "restore_backup",
    {
      description: "Restore a server from a backup. If truncate is true, all current files are deleted before restoring. WARNING: This is irreversible and will overwrite existing files. The server should be stopped before restoring. Use list_backups to find the backup UUID. Requires Client API key.",
      inputSchema: z59.object({
        server_identifier: z59.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        backup_uuid: z59.string().min(1).describe("UUID of the backup to restore from list_backups"),
        truncate: z59.boolean().optional().describe(
          "If true, delete all current server files before restoring (default: false). WARNING: irreversible."
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.restoreBackup(params.server_identifier, params.backup_uuid, params.truncate);
        return formatToolResponse({
          success: true,
          message: `Backup ${params.backup_uuid} is being restored. This may take several minutes.`,
          server_identifier: params.server_identifier,
          backup_uuid: params.backup_uuid,
          truncate: params.truncate ?? false
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/rotate-database-password.ts
import { z as z60 } from "zod/v4";
function registerRotateDatabasePasswordTool(server, client) {
  server.registerTool(
    "rotate_database_password",
    {
      description: "Generate a new random password for a database. Returns the new connection details including the new password. The old password is immediately invalidated. Use list_client_databases to find the database ID. Requires Client API key.",
      inputSchema: z60.object({
        server_identifier: z60.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        database_id: z60.string().min(1).describe("Database ID from list_client_databases")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.rotateDatabasePassword(
          params.server_identifier,
          params.database_id
        );
        return formatToolResponse({
          server_identifier: params.server_identifier,
          database: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/send-command.ts
import { z as z61 } from "zod/v4";
function registerSendCommandTool(server, client) {
  server.registerTool(
    "send_command",
    {
      description: "Send a console command to a running game server (e.g., Minecraft '/say hello', '/whitelist add Player', '/op Player'). The server MUST be running or the command will fail silently. For power control (start/stop/restart), use the dedicated power tools instead. WARNING: Commands are sent directly to the server console and execute immediately. Requires Client API key.",
      inputSchema: z61.object({
        server_identifier: z61.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        command: z61.string().min(1).max(1e3).describe("Console command to send (e.g. 'say Hello', 'whitelist add Player')")
      }),
      annotations: {
        destructiveHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const sanitized = sanitizeCommand(params.command);
        const safety = checkCommandSafety(sanitized);
        await client.sendCommand(params.server_identifier, sanitized);
        const response = {
          success: true,
          message: `Command sent to server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          command: sanitized
        };
        if (!safety.safe) {
          response.warning = "This command matched potentially dangerous patterns. It was still executed.";
          response.matched_patterns = safety.warnings;
        }
        return formatToolResponse(response);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/start-server.ts
import { z as z62 } from "zod/v4";
function registerStartServerTool(server, client) {
  server.registerTool(
    "start_server",
    {
      description: "Start a stopped game server. The server must be in 'offline' or 'stopped' state. Has no effect if already running. Use get_server_resources to check current power state before calling. For stopping, use stop_server. Requires Client API key.",
      inputSchema: z62.object({
        server_identifier: z62.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.sendPowerAction(params.server_identifier, "start");
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_identifier} is starting.`,
          server_identifier: params.server_identifier,
          action: "start"
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/stop-server.ts
import { z as z63 } from "zod/v4";
function registerStopServerTool(server, client) {
  server.registerTool(
    "stop_server",
    {
      description: "Stop a running game server gracefully. Sends a stop signal so the server shuts down cleanly (saves world data, disconnects players). If the server does not stop, use kill_server as a last resort. Requires Client API key.",
      inputSchema: z63.object({
        server_identifier: z63.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        )
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.sendPowerAction(params.server_identifier, "stop");
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_identifier} is stopping.`,
          server_identifier: params.server_identifier,
          action: "stop"
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/suspend-server.ts
import { z as z64 } from "zod/v4";
function registerSuspendServerTool(server, client) {
  server.registerTool(
    "suspend_server",
    {
      description: "Suspend a server (admin action). Suspended servers are forcefully stopped and users cannot start them until unsuspended. Use to disable a server for policy violations or billing issues. Use unsuspend_server to re-enable. Requires Application API key.",
      inputSchema: z64.object({
        server_id: z64.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.suspendServer(params.server_id);
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_id} has been suspended.`,
          server_id: params.server_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/unsuspend-server.ts
import { z as z65 } from "zod/v4";
function registerUnsuspendServerTool(server, client) {
  server.registerTool(
    "unsuspend_server",
    {
      description: "Unsuspend a previously suspended server (admin action). Re-enables the server so users can start and use it again. Idempotent: calling on a non-suspended server has no effect. Requires Application API key.",
      inputSchema: z65.object({
        server_id: z65.number().int().positive().describe("Numeric server ID from list_servers field 'id'")
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.unsuspendServer(params.server_id);
        return formatToolResponse({
          success: true,
          message: `Server ${params.server_id} has been unsuspended.`,
          server_id: params.server_id
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-egg-variable.ts
import { z as z66 } from "zod/v4";
function registerUpdateEggVariableTool(server, client) {
  server.registerTool(
    "update_egg_variable",
    {
      description: "Update an existing environment variable on an egg (admin action). All fields are optional - only provided fields will be changed. Use list_egg_variables to find the variable_id. Requires Application API key.",
      inputSchema: z66.object({
        nest_id: z66.number().int().positive().describe("Nest ID that contains the egg (from list_nests)"),
        egg_id: z66.number().int().positive().describe("Egg ID that contains the variable (from list_eggs)"),
        variable_id: z66.number().int().positive().describe("Variable ID to update (from list_egg_variables)"),
        name: z66.string().min(1).optional().describe("New display name for the variable"),
        description: z66.string().optional().describe("New description"),
        env_variable: z66.string().min(1).optional().describe("New environment variable key"),
        default_value: z66.string().optional().describe("New default value"),
        user_viewable: z66.boolean().optional().describe("Whether users can see this variable"),
        user_editable: z66.boolean().optional().describe("Whether users can modify this variable"),
        rules: z66.string().min(1).optional().describe("New Laravel validation rules")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const data = {};
        if (params.name !== void 0) data.name = params.name;
        if (params.description !== void 0) data.description = params.description;
        if (params.env_variable !== void 0) data.env_variable = params.env_variable;
        if (params.default_value !== void 0) data.default_value = params.default_value;
        if (params.user_viewable !== void 0) data.user_viewable = params.user_viewable;
        if (params.user_editable !== void 0) data.user_editable = params.user_editable;
        if (params.rules !== void 0) data.rules = params.rules;
        const result = await client.updateEggVariable(
          params.nest_id,
          params.egg_id,
          params.variable_id,
          data
        );
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-schedule.ts
import { z as z67 } from "zod/v4";
function registerUpdateScheduleTool(server, client) {
  server.registerTool(
    "update_schedule",
    {
      description: "Update an existing scheduled task for a server. All cron fields and the name must be provided (this is a full replace). Use get_schedule to see the current values before updating. Requires Client API key.",
      inputSchema: z67.object({
        server_identifier: z67.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        schedule_id: z67.number().int().positive().describe("Numeric schedule ID from list_schedules"),
        name: z67.string().min(1).describe("Display name for the schedule"),
        minute: z67.string().min(1).describe("Cron minute field (e.g., '0', '*/15', '0,30')"),
        hour: z67.string().min(1).describe("Cron hour field (e.g., '*', '3', '0,12')"),
        day_of_week: z67.string().min(1).describe("Cron day-of-week field (e.g., '*', '1-5' for Mon-Fri)"),
        day_of_month: z67.string().min(1).describe("Cron day-of-month field (e.g., '*', '1', '1,15')"),
        month: z67.string().min(1).describe("Cron month field (e.g., '*', '1-6')"),
        is_active: z67.boolean().optional().describe("Whether the schedule is active (default: true)"),
        only_when_online: z67.boolean().optional().describe("Only run when the server is online (default: true)")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.updateSchedule(params.server_identifier, params.schedule_id, {
          name: params.name,
          cron_minute: params.minute,
          cron_hour: params.hour,
          cron_day_of_week: params.day_of_week,
          cron_day_of_month: params.day_of_month,
          cron_month: params.month,
          is_active: params.is_active,
          only_when_online: params.only_when_online
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          schedule: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-server-build.ts
import { z as z68 } from "zod/v4";
function registerUpdateServerBuildTool(server, client) {
  server.registerTool(
    "update_server_build",
    {
      description: "Update a server's resource limits: memory, CPU, disk, swap, IO weight, CPU pinning, and feature limits like max databases/backups (admin action). Only specify the fields you want to change - current values are preserved for unspecified fields. Changes take effect after server restart. For server metadata (name, owner), use update_server_details. Requires Application API key.",
      inputSchema: z68.object({
        server_id: z68.number().int().positive().describe("Numeric server ID from list_servers field 'id'"),
        memory: z68.number().int().min(0).optional().describe("Memory limit in MB (0 = unlimited)"),
        swap: z68.number().int().optional().describe("Swap limit in MB (-1 = unlimited)"),
        disk: z68.number().int().min(0).optional().describe("Disk limit in MB (0 = unlimited)"),
        io: z68.number().int().min(10).max(1e3).optional().describe("IO weight (10-1000)"),
        cpu: z68.number().int().min(0).optional().describe("CPU limit in percent (100 = 1 core, 0 = unlimited)"),
        threads: z68.string().optional().describe("CPU threads/cores to pin (e.g. '0', '0-1,3')"),
        allocation: z68.number().int().positive().optional().describe("Default allocation ID"),
        databases_limit: z68.number().int().min(0).optional().describe("Max databases"),
        allocations_limit: z68.number().int().min(0).optional().describe("Max allocations"),
        backups_limit: z68.number().int().min(0).optional().describe("Max backups")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const current = await client.getServer(params.server_id);
        const body = {
          memory: params.memory ?? current.limits.memory,
          swap: params.swap ?? current.limits.swap,
          disk: params.disk ?? current.limits.disk,
          io: params.io ?? current.limits.io,
          cpu: params.cpu ?? current.limits.cpu,
          threads: params.threads ?? current.limits.threads ?? "",
          allocation: params.allocation ?? current.allocation,
          feature_limits: {
            databases: params.databases_limit ?? current.feature_limits.databases,
            allocations: params.allocations_limit ?? current.feature_limits.allocations,
            backups: params.backups_limit ?? current.feature_limits.backups
          }
        };
        const result = await client.updateServerBuild(params.server_id, body);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-server-details.ts
import { z as z69 } from "zod/v4";
function registerUpdateServerDetailsTool(server, client) {
  server.registerTool(
    "update_server_details",
    {
      description: "Update a server's metadata: name, description, owner, or external ID (admin action). Only specify the fields you want to change - current values are preserved for unspecified fields. For resource limits, use update_server_build. Requires Application API key.",
      inputSchema: z69.object({
        server_id: z69.number().int().positive().describe("Numeric server ID from list_servers field 'id'"),
        name: z69.string().min(1).optional().describe("New server name"),
        description: z69.string().optional().describe("New server description"),
        user: z69.number().int().positive().optional().describe("New owner user ID"),
        external_id: z69.string().optional().describe("New external ID")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const current = await client.getServer(params.server_id);
        const body = {
          name: params.name ?? current.name,
          description: params.description ?? current.description,
          user: params.user ?? current.user,
          external_id: params.external_id ?? current.external_id ?? ""
        };
        const result = await client.updateServerDetails(params.server_id, body);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-server-startup.ts
import { z as z70 } from "zod/v4";
function registerUpdateServerStartupTool(server, client) {
  server.registerTool(
    "update_server_startup",
    {
      description: "Update a server's startup configuration: startup command, Docker image, or egg template (admin action). Only specify the fields you want to change - current values are preserved for unspecified fields. Changes take effect after server restart. Requires Application API key.",
      inputSchema: z70.object({
        server_id: z70.number().int().positive().describe("Numeric server ID from list_servers field 'id'"),
        startup: z70.string().min(1).optional().describe("New startup command"),
        image: z70.string().min(1).optional().describe("New Docker image"),
        egg: z70.number().int().positive().optional().describe("New egg ID")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const current = await client.getServer(params.server_id);
        const body = {
          startup: params.startup ?? current.container.startup_command,
          image: params.image ?? current.container.image,
          egg: params.egg ?? current.egg,
          environment: current.container.environment
        };
        const result = await client.updateServerStartup(params.server_id, body);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-subuser.ts
import { z as z71 } from "zod/v4";
function registerUpdateSubuserTool(server, client) {
  server.registerTool(
    "update_subuser",
    {
      description: "Update the permissions of an existing sub-user on a server. This replaces ALL permissions, so include every permission the user should have. Use list_subusers to find the user UUID and see current permissions. Requires Client API key.",
      inputSchema: z71.object({
        server_identifier: z71.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        user_uuid: z71.string().min(1).describe("UUID of the sub-user from list_subusers"),
        permissions: z71.array(z71.string().min(1)).min(1).describe(
          "Complete list of permission strings to set (replaces all existing permissions)"
        )
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client.updateSubuser(params.server_identifier, params.user_uuid, {
          permissions: params.permissions
        });
        return formatToolResponse({
          server_identifier: params.server_identifier,
          subuser: result
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/update-user.ts
import { z as z72 } from "zod/v4";
function registerUpdateUserTool(server, client) {
  server.registerTool(
    "update_user",
    {
      description: "Update an existing user account's details: username, email, password, or admin status (admin action). Use list_users or get_user to find the user ID first. Requires Application API key.",
      inputSchema: z72.object({
        user_id: z72.number().int().positive().describe("User numeric ID"),
        username: z72.string().min(1).optional().describe("New username"),
        email: z72.string().email().optional().describe("New email address"),
        password: z72.string().min(8).optional().describe("New password (min 8 characters)"),
        root_admin: z72.boolean().optional().describe("Whether the user is an admin")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const { user_id, ...userData } = params;
        const result = await client.updateUser(user_id, userData);
        return formatToolResponse(result);
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/tools/write-file.ts
import { z as z73 } from "zod/v4";
function registerWriteFileTool(server, client) {
  server.registerTool(
    "write_file",
    {
      description: "Write content to a file on a server. Creates the file if it does not exist, or overwrites it entirely if it does. Use read_file first to get current content if you need to modify an existing file. The server may need a restart for config changes to take effect. Requires Client API key.",
      inputSchema: z73.object({
        server_identifier: z73.string().min(1).describe(
          "Short server identifier string from list_servers field 'identifier' (e.g., 'a1b2c3d4')"
        ),
        file_path: z73.string().min(1).describe("Absolute path to the file, e.g. /server.properties"),
        content: z73.string().describe("File content to write")
      }),
      annotations: { destructiveHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        await client.writeFile(params.server_identifier, params.file_path, params.content);
        return formatToolResponse({
          success: true,
          message: `File written to ${params.file_path} on server ${params.server_identifier}.`,
          server_identifier: params.server_identifier,
          file_path: params.file_path
        });
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}

// src/version.ts
var VERSION = "0.1.0";

// src/server.ts
var APP_TOOLS_COUNT = 34;
var CLIENT_TOOLS_COUNT = 39;
function countTools(hasClientKey) {
  return hasClientKey ? CLIENT_TOOLS_COUNT : 0;
}
function createServer2(client) {
  const server = new McpServer({
    name: "pterodactyl-mcp",
    version: VERSION
  });
  if (client.hasAppKey) {
    registerListServersTool(server, client);
    registerGetServerTool(server, client);
    registerSuspendServerTool(server, client);
    registerUnsuspendServerTool(server, client);
    registerReinstallServerTool(server, client);
    registerCreateServerTool(server, client);
    registerDeleteEggTool(server, client);
    registerDeleteServerTool(server, client);
    registerUpdateServerDetailsTool(server, client);
    registerUpdateServerBuildTool(server, client);
    registerUpdateServerStartupTool(server, client);
    registerListServerDatabasesTool(server, client);
    registerListUsersTool(server, client);
    registerGetUserTool(server, client);
    registerCreateUserTool(server, client);
    registerUpdateUserTool(server, client);
    registerListNodesTool(server, client);
    registerGetEggTool(server, client);
    registerGetNodeTool(server, client);
    registerGetNodeConfigTool(server, client);
    registerImportEggTool(server, client);
    registerListEggsTool(server, client);
    registerListRolesTool(server, client);
    registerListMountsTool(server, client);
    registerListNestsTool(server, client);
    registerGetNestTool(server, client);
    registerListAllocationsTool(server, client);
    registerCreateAllocationTool(server, client);
    registerDeleteAllocationTool(server, client);
    registerListEggVariablesTool(server, client);
    registerCreateEggVariableTool(server, client);
    registerUpdateEggVariableTool(server, client);
    registerDeleteEggVariableTool(server, client);
    registerExportEggTool(server, client);
  }
  if (client.hasClientKey) {
    registerGetServerResourcesTool(server, client);
    registerStartServerTool(server, client);
    registerStopServerTool(server, client);
    registerRestartServerTool(server, client);
    registerKillServerTool(server, client);
    registerSendCommandTool(server, client);
    registerListFilesTool(server, client);
    registerReadFileTool(server, client);
    registerWriteFileTool(server, client);
    registerCreateFolderTool(server, client);
    registerDeleteFilesTool(server, client);
    registerCompressFilesTool(server, client);
    registerDecompressFileTool(server, client);
    registerRenameFileTool(server, client);
    registerListBackupsTool(server, client);
    registerCreateBackupTool(server, client);
    registerListSchedulesTool(server, client);
    registerListClientDatabasesTool(server, client);
    registerListSubusersTool(server, client);
    registerGetStartupVariablesTool(server, client);
    registerGetAccountTool(server, client);
    registerGetScheduleTool(server, client);
    registerCreateScheduleTool(server, client);
    registerUpdateScheduleTool(server, client);
    registerDeleteScheduleTool(server, client);
    registerCreateScheduleTaskTool(server, client);
    registerDeleteScheduleTaskTool(server, client);
    registerCreateSubuserTool(server, client);
    registerUpdateSubuserTool(server, client);
    registerDeleteSubuserTool(server, client);
    registerCreateDatabaseTool(server, client);
    registerDeleteDatabaseTool(server, client);
    registerRotateDatabasePasswordTool(server, client);
    registerDeleteBackupTool(server, client);
    registerDownloadBackupTool(server, client);
    registerRestoreBackupTool(server, client);
    registerDownloadFileTool(server, client);
    registerGetRecentLogsTool(server, client);
    registerGetServerActivityTool(server, client);
  }
  return server;
}

// src/index.ts
function loadConfig() {
  const baseUrl = process.env.PTERODACTYL_URL || process.env.PTERO_URL;
  const appKey = process.env.PTERODACTYL_APP_KEY;
  const clientKey = process.env.PTERODACTYL_CLIENT_KEY || process.env.PTERO_KEY;
  if (!baseUrl) {
    console.error("Error: PTERODACTYL_URL environment variable is required.");
    process.exit(1);
  }
  if (!appKey && !clientKey) {
    console.error("Error: PTERODACTYL_APP_KEY or PTERODACTYL_CLIENT_KEY environment variable is required.");
    process.exit(1);
  }
  return {
    baseUrl,
    appKey: appKey || void 0,
    clientKey: clientKey || void 0,
    allowInsecure: process.env.PTERODACTYL_ALLOW_INSECURE === "true"
  };
}
async function healthCheck(client, baseUrl, toolsCount) {
  try {
    if (client.hasAppKey) {
      const result = await client.listServers({ page: 1, per_page: 1 });
      const total = result.pagination.total;
      console.error(
        `Connected to ${baseUrl} - ${total} server${total !== 1 ? "s" : ""} found - ${toolsCount} tools available`
      );
    } else {
      const account = await client.getAccount();
      console.error(
        `Connected to ${baseUrl} as ${account.username ?? account.email ?? "client user"} - ${toolsCount} client tools available`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Warning: Health check failed for ${baseUrl} - ${message}. The MCP server will start anyway, but API calls may fail. Verify PTERODACTYL_URL and configured API key are correct.`
    );
  }
}
async function main() {
  const config = loadConfig();
  const client = new PterodactylClient(config);
  const hasClientKey = !!config.clientKey;
  const toolsCount = (config.appKey ? APP_TOOLS_COUNT : 0) + countTools(hasClientKey);
  const server = createServer2(client);
  const transport = new CompatStdioServerTransport();
  await server.connect(transport);
  const mode = config.appKey && hasClientKey ? "dual-key (admin + client)" : config.appKey ? "app-key only (admin)" : "client-key only";
  console.error(`Pterodactyl MCP Server running on stdio [${mode}]`);
  await healthCheck(client, config.baseUrl, toolsCount);
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
