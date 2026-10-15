// For tests only: the pages this app really has, read from src/app, so a test can check that a link
// leads somewhere. A route group such as `(app)` is not part of the address.

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export function appRoutes(root = join(process.cwd(), "src", "app")): Set<string> {
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === "page.tsx") {
        const segments = relative(root, dir)
          .split(sep)
          .filter((segment) => segment && !/^\(.*\)$/.test(segment));
        routes.add(`/${segments.join("/")}`);
      }
    }
  };
  walk(root);
  return routes;
}

/** The page a link inside the app opens: its path, without the query or the part after `#`. */
export function pathOf(href: string): string {
  return href.split(/[?#]/)[0] || "/";
}
