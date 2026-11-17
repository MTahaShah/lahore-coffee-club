/* Quiet pages: hairline under the nav once you scroll, and the contents list follows where you are. */
{
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const links = [...document.querySelectorAll(".toc a")];
  if (links.length && "IntersectionObserver" in window) {
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)));
      const first = [...byId.keys()].find((id) => seen.has(id));
      if (first) links.forEach((a) => a.setAttribute("aria-current", String(a === byId.get(first))));
    }, { rootMargin: "-20% 0px -60% 0px" });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
}
