export class HistoryRequestError extends Error {
  constructor(readonly code: "HISTORY_REQUEST_DENIED" | "HISTORY_REQUEST_CONFLICT" | "HISTORY_REQUEST_INVALID") {
    super(code);
  }
}
