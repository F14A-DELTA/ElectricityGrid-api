import { EventEmitter } from "node:events";

import OpenElectricityClient from "openelectricity";

    await Promise.all([
      putJson("live/snapshot.json", combinedSnapshot, 300),
      putJson(getLiveKey("NEM"), nemSnapshot, 300),
      ...Object.keys(nemSnapshot.regions).map((region) =>
        putJson(getLiveKey("NEM", region), nemSnapshot.regions[region as keyof typeof nemSnapshot.regions], 300),
      ),
      putJson(getLiveKey("WEM", "WEM"), wemSnapshot, 300),
      putJson(getRawKey("NEM", now), nemSnapshot, 0),
      putJson(getRawKey("WEM", now), wemSnapshot, 0),
    ]);

    lastPollAt = new Date();
    emitter.emit("update", {
      nem: nemSnapshot,
      wem: wemSnapshot,
    });

    console.log(
      `Poll complete - NEM ${nemSnapshot.summary.net_generation_mw}MW, ${nemSnapshot.summary.renewables_pct}% renewable. Duration: ${Date.now() - pollStart}ms.`,
    );
  } catch (error) {
    console.error("Poll failed.", error);
  }
}

export function startPoller(): NodeJS.Timeout {
  void poll();
  return setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}
