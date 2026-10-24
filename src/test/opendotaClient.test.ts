import { describe, expect, it, vi } from "vitest";
import { OpenDotaClient, OpenDotaError } from "../services/opendota/client";
import apiError from "./fixtures/api-error.json";
import historyRows from "./fixtures/history-turbo.json";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function makeClient(responses: (Response | Error)[]) {
  let i = 0;
  const fetchImpl = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return new OpenDotaClient({
    fetchImpl,
    maxRetries: 2,
    retryDelayMs: 0,
    sleep: async () => {},
  });
}

describe("OpenDotaClient — успех", () => {
  it("загружает историю и проверяет, что это массив", async () => {
    const client = makeClient([jsonResponse(historyRows)]);
    const rows = await client.getPlayerMatches(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].match_id).toBe(8462082943);
  });

  it("пустая история — это [] без ошибки", async () => {
    const client = makeClient([jsonResponse([])]);
    const rows = await client.getPlayerMatches(1, { gameMode: 23 });
    expect(rows).toEqual([]);
  });

  it("параметры запроса передаются (game_mode=23, offset)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const client = new OpenDotaClient({ fetchImpl, sleep: async () => {} });
    await client.getPlayerMatches(7, { gameMode: 23, limit: 20, offset: 40 });
    const url = String(vi.mocked(fetchImpl).mock.calls[0][0]);
    expect(url).toContain("game_mode=23");
    expect(url).toContain("offset=40");
    expect(url).toContain("limit=20");
  });
});

describe("OpenDotaClient — ошибки", () => {
  it("HTTP 429 классифицируется как rate_limit с повтором", async () => {
    const client = makeClient([jsonResponse({}, 429), jsonResponse([])]);
    await expect(client.getPlayerMatches(1)).resolves.toEqual([]);
  });

  it("HTTP 429 после всех повторов → rate_limit", async () => {
    const client = makeClient([jsonResponse({}, 429)]);
    await expect(client.getPlayerMatches(1)).rejects.toMatchObject({
      kind: "rate_limit",
      action: "retry",
    });
  });

  it("HTTP 404 → not_found без повторов", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    const client = new OpenDotaClient({ fetchImpl, sleep: async () => {} });
    await expect(client.getMatch(1)).rejects.toMatchObject({
      kind: "not_found",
      action: "back",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("HTTP 401/403 → unauthorized", async () => {
    const client = makeClient([jsonResponse({}, 403)]);
    await expect(client.getPlayerProfile(1)).rejects.toMatchObject({
      kind: "unauthorized",
      action: "check_privacy",
    });
  });

  it("HTTP 500 повторяется, затем падает как server", async () => {
    const client = makeClient([jsonResponse({}, 500)]);
    await expect(client.getMatch(1)).rejects.toMatchObject({
      kind: "server",
      action: "retry",
    });
  });

  it("сетевая ошибка (CORS/офлайн) классифицируется как network", async () => {
    const client = makeClient([new TypeError("Failed to fetch")]);
    await expect(client.getMatch(1)).rejects.toMatchObject({
      kind: "network",
      action: "retry",
    });
  });

  it("некорректный JSON → invalid_json", async () => {
    const broken = {
      ok: true,
      status: 200,
      text: async () => "<html>gateway error</html>",
    } as unknown as Response;
    const client = makeClient([broken]);
    await expect(client.getMatch(1)).rejects.toMatchObject({ kind: "invalid_json" });
  });

  it("err-объект OpenDota (необработанный матч) → not_processed", async () => {
    const client = makeClient([jsonResponse({ err: "Match 1 not parsed" })]);
    await expect(client.getMatch(1)).rejects.toMatchObject({
      kind: "not_processed",
      action: "back",
    });
  });

  it("err о приватности → private", async () => {
    const client = makeClient([
      jsonResponse({ err: "Player has a private profile" }),
    ]);
    await expect(client.getPlayerProfile(1)).rejects.toMatchObject({
      kind: "private",
      action: "check_privacy",
    });
  });

  it("текст ошибки API из фикстуры понятен и не роняет клиент", async () => {
    const client = makeClient([jsonResponse(apiError)]);
    await expect(client.getMatch(9999999999)).rejects.toBeInstanceOf(OpenDotaError);
  });

  it("не-массив в истории → invalid_json (не пустая история)", async () => {
    const client = makeClient([jsonResponse({ oops: true })]);
    await expect(client.getPlayerMatches(1)).rejects.toMatchObject({
      kind: "invalid_json",
    });
  });
});
