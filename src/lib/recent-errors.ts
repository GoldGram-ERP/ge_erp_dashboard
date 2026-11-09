// The last few errors this screen got from the API, kept in memory only, so a bug report can say what the server answered
// just before the person pressed "Report a bug". Only the address (no query, no body), the status and the error's name are kept.
export type RecentError = { path: string; status: number; message: string; at: string };

const MAX = 10;
const buffer: RecentError[] = [];

export function noteError(path: string, status: number, message: string) {
  buffer.push({ path: path.split("?")[0].slice(0, 200), status, message: message.slice(0, 200), at: new Date().toISOString() });
  if (buffer.length > MAX) buffer.shift();
}

export const recentErrors = (): RecentError[] => [...buffer];
