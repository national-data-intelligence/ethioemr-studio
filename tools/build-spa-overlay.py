"""Load the platform's extra frontend modules (Form Studio, AI assistant, ...) into the team's published frontend.

The published EthioEMR frontend image does not contain these modules yet (until each is published to npm and added
to distro/frontend/spa-assemble-config.json, the team's standard route). This writes work/spa-overlay/, which the
gateway serves in place of the frontend's own files (gateway/platform.conf.template):
  importmap.json         the frontend's app list plus one entry per module, pointing at ./overlay/<name>/<entry>.js
  routes.registry.json   the frontend's route registry plus each module's routes.json
  modules/<name>/        each module's built files (source maps skipped unless --keep-maps)

Modules are described by modules/<name>/module.json:
  {"package": "@palladium-ethiopia/esm-x-app", "dist": "dist" | "$ENV_VAR" | "relative/or/absolute/path",
   "entry": "palladium-ethiopia-esm-x-app.js"}           # entry optional: defaults to <scope>-<name>.js

Run after the stack starts, and again after a module is rebuilt:
    python tools/build-spa-overlay.py            # or: .\\platform.ps1 overlay
"""
import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "work" / "spa-overlay"
SPA = "/usr/share/nginx/html/openmrs/spa"  # where the published frontend image keeps the app


def env(name, default=""):
    """Value from the environment, else from .env, else default."""
    if os.environ.get(name):
        return os.environ[name]
    dotenv = ROOT / ".env"
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(name + "="):
                return line.split("=", 1)[1].strip()
    return default


def long_path(p: Path) -> str:
    """Windows: allow paths over 260 characters (development builds have very long chunk file names)."""
    s = str(p.resolve())
    prefix = "\\\\?\\"
    return prefix + s if os.name == "nt" and not s.startswith(prefix) else s


def from_frontend(container, name):
    """The frontend container's own copy (read directly, not through the gateway, which serves the overlay)."""
    raw = subprocess.run(["docker", "exec", container, "cat", f"{SPA}/{name}"], capture_output=True, check=True,
                         env={**os.environ, "MSYS_NO_PATHCONV": "1"}).stdout
    return json.loads(raw.decode("utf-8"))


def resolve_dist(module_dir: Path, spec: str) -> Path:
    if spec.startswith("$"):
        var, spec = spec[1:], env(spec[1:])
        if not spec:
            raise SystemExit(f"{module_dir.name}: {var} is not set (see .env.example)")
    p = Path(spec)
    return p if p.is_absolute() else (module_dir / p if (module_dir / p).exists() else ROOT / p)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frontend", default=os.environ.get("PLATFORM_FRONTEND", "ethioemr-platform-frontend-1"))
    ap.add_argument("--keep-maps", action="store_true", help="also copy *.map source maps")
    a = ap.parse_args()

    importmap = from_frontend(a.frontend, "importmap.json")
    registry = from_frontend(a.frontend, "routes.registry.json")
    # app shell 10.x wraps every app's routes in a top-level "routes" object; older shells list apps at the top
    apps = registry["routes"] if isinstance(registry.get("routes"), dict) else registry
    base_count = len(importmap["imports"])

    if (OUT / "modules").exists():
        shutil.rmtree(long_path(OUT / "modules"))
    (OUT / "modules").mkdir(parents=True)

    for spec_file in sorted((ROOT / "modules").glob("*/module.json")):
        mdir = spec_file.parent
        spec = json.loads(spec_file.read_text(encoding="utf-8"))
        package = spec["package"]
        dist = resolve_dist(mdir, spec.get("dist", "dist"))
        routes_file = dist / "routes.json"
        if not routes_file.is_file():
            raise SystemExit(f"{package}: no routes.json in {dist} (build the module first)")
        entry = spec.get("entry") or re.sub(r"^@", "", package).replace("/", "-") + ".js"
        if not (dist / entry).is_file():
            raise SystemExit(f"{package}: entry {entry} not found in {dist}")
        routes = json.loads(routes_file.read_text(encoding="utf-8"))
        target = OUT / "modules" / mdir.name
        shutil.copytree(long_path(dist), long_path(target),
                        ignore=None if a.keep_maps else shutil.ignore_patterns("*.map"))
        importmap["imports"][package] = f"./overlay/{mdir.name}/{entry}"
        apps[package] = routes
        files = sum(len(f) for _, _, f in os.walk(long_path(target)))
        print(f"  + {package} {routes.get('version', '')}  ({files} files from {dist})")

    (OUT / "importmap.json").write_text(json.dumps(importmap, indent=2), encoding="utf-8")
    (OUT / "routes.registry.json").write_text(json.dumps(registry, indent=2), encoding="utf-8")
    print(f"apps in importmap: {base_count} from the frontend + {len(importmap['imports']) - base_count} overlay "
          f"= {len(importmap['imports'])}; wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
