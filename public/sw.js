const CACHE = "scheduler-shell-v2";
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/offline.html", "/icon-192.png"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate")
    e.respondWith(
      !self.navigator.onLine ? caches.match("/offline.html") :
      fetch(e.request).catch(() => caches.match("/offline.html"))
    );
});
self.addEventListener("push", (e) => {
  let p = {};
  try {
    p = e.data.json();
  } catch {}
  e.waitUntil(
    self.registration.showNotification(p.title || "Hora de publicar", {
      body: p.body || "Seu próximo post está pronto.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: p.tag || "scheduler",
      data: { url: "/?job=" + encodeURIComponent(p.jobId || "") },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const list = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (list.length) {
        await list[0].navigate(e.notification.data.url);
        return list[0].focus();
      }
      return clients.openWindow(e.notification.data.url);
    })(),
  );
});
