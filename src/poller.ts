import { EventEmitter } from "node:events";

import OpenElectricityClient from "openelectricity";

i
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
