import os from "node:os";

export function lanIpv4() {
  const ips: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) ips.push(a.address);
    }
  }
  return ips;
}

export function lanUrls(port = Number(process.env.PORT) || 3000) {
  return lanIpv4().map((ip) => `http://${ip}:${port}`);
}
