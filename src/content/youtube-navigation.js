export class YoutubeNavigation {
  constructor(onNavigate) {
    this.onNavigate = onNavigate;
    this.currentUrl = "";
    this.currentVideoId = null;
    this.interval = null;
    this.handleEvent = () => this.check();
  }

  start() {
    document.addEventListener("yt-navigate-finish", this.handleEvent);
    window.addEventListener("popstate", this.handleEvent);
    window.addEventListener("hashchange", this.handleEvent);
    this.interval = window.setInterval(this.handleEvent, 1000);
    this.check();
  }

  check() {
    const url = location.href;
    let videoId = null;
    try {
      const parsed = new URL(url);
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v");
      else {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts[0] === "live" || parts[0] === "shorts") videoId = parts[1] || null;
      }
    } catch {
      videoId = null;
    }
    if (url === this.currentUrl && videoId === this.currentVideoId) return;
    const previous = { url: this.currentUrl, videoId: this.currentVideoId };
    this.currentUrl = url;
    this.currentVideoId = videoId;
    this.onNavigate?.({ url, videoId, previous });
  }

  dispose() {
    document.removeEventListener("yt-navigate-finish", this.handleEvent);
    window.removeEventListener("popstate", this.handleEvent);
    window.removeEventListener("hashchange", this.handleEvent);
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
  }
}
