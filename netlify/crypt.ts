import {createHash} from "node:crypto";

export function sha256hashOf(x: string) {
  const h = createHash("sha256");
  h.update(x, "utf-8");
  return h.digest('hex');
}
