import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** Width and height from a PNG's header. */
function pngSize(path: string): string {
  const header = readFileSync(path);
  expect(header.subarray(1, 4).toString("latin1")).toBe("PNG");
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const app = manifest();

  it("opens in its own window from the home screen", () => {
    expect(app).toMatchObject({ name: "Textcrew", short_name: "Textcrew", start_url: "/", display: "standalone" });
    expect(app.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(app.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has the two sizes Android asks for, plain and maskable", () => {
    const icons = app.icons ?? [];
    for (const purpose of ["any", "maskable"]) {
      expect(icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    }
  });

  it("points at icon files that exist and are the size they say", () => {
    for (const icon of app.icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(fromRoot(`public${icon.src}`))).toBe(icon.sizes);
    }
  });

  it("ships the iPhone home-screen icon", () => {
    expect(pngSize(fromRoot("src/app/apple-icon.png"))).toBe("180x180");
  });
});
