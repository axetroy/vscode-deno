import * as path from "path";
import { Readable } from "stream";

import execa from "execa";
import which from "which";
import * as semver from "semver";
import { normalizeFilepath, hashURL } from "./util";

export type Version = {
  deno: string;
  v8: string;
  typescript: string;
  raw: string;
};

function getDefaultDenoDir() {
  // ref https://deno.land/manual.html
  // On Linux/Redox: $XDG_CACHE_HOME/deno or $HOME/.cache/deno
  // On Windows: %LOCALAPPDATA%/deno (%LOCALAPPDATA% = FOLDERID_LocalAppData)
  // On macOS: $HOME/Library/Caches/deno
  // If something fails, it falls back to $HOME/.deno
  let denoDir = process.env.DENO_DIR;
  if (denoDir === undefined) {
    switch (process.platform) {
      /* istanbul ignore next */
      case "win32":
        denoDir = `${process.env.LOCALAPPDATA}\\deno`;
        break;
      /* istanbul ignore next */
      case "darwin":
        denoDir = `${process.env.HOME}/Library/Caches/deno`;
        break;
      /* istanbul ignore next */
      case "linux":
        denoDir = process.env.XDG_CACHE_HOME
          ? `${process.env.XDG_CACHE_HOME}/deno`
          : `${process.env.HOME}/.cache/deno`;
        break;
      /* istanbul ignore next */
      default:
        denoDir = `${process.env.HOME}/.deno`;
    }
  }

  return denoDir;
}

interface DenoInterface {
  executablePath: string | void;
  version: Version | void;
  unstable: boolean;
  DENO_DIR: string;
  DENO_DEPS_DIR: string;
  TYPE_FILE: string;
  TYPE: Buffer | void;
  format(code: string): Promise<string | void>;
  enableUnstableMode(unstable: boolean): void;
  changeDenoDir(DENO_DIR: string): void;
  isDenoCachedModule(filepath: string): boolean;
  convertURL2Filepath(url: URL): string;
}

class Deno implements DenoInterface {
  public unstable = false;
  private _DENO_DIR!: string;
  // deno cache root dir
  public get DENO_DIR(): string {
    return this._DENO_DIR || getDefaultDenoDir();
  }
  // deno cache deps dir
  public get DENO_DEPS_DIR(): string {
    return path.join(this.DENO_DIR, "deps");
  }
  // deno declaration file path
  public get TYPE_FILE(): string {
    return path.join(
      this.DENO_DIR,
      this.unstable ? "lib.deno.unstable.d.ts" : "lib.deno.d.ts"
    );
  }
  public get TYPE(): Buffer | void {
    const version = this.version;

    /* istanbul ignore next */
    if (!version) {
      /* istanbul ignore next */
      return;
    }

    try {
      const { stdout } = execa.sync(this.executablePath as string, [
        "types",
        ...(this.unstable &&
        version &&
        /* istanbul ignore next */
        semver.gte(version.deno, "0.43.0") /* istanbul ignore next */
          ? ["--unstable"] /* istanbul ignore next */
          : []),
      ]);

      return Buffer.from(stdout, "utf8");
    } catch {
      /* istanbul ignore next */
      return;
    }
  }
  public get executablePath(): string | void {
    try {
      return which.sync("deno");
    } catch {
      /* istanbul ignore next */
      return;
    }
  }
  public get version(): Version | void {
    /* istanbul ignore next */
    if (!this.executablePath) {
      /* istanbul ignore next */
      return;
    }

    try {
      const { stdout, stderr } = execa.sync(this.executablePath as string, [
        "eval",
        "console.log(JSON.stringify(Deno.version))",
      ]);

      /* istanbul ignore next */
      if (stderr) {
        /* istanbul ignore next */
        return;
      } else {
        const { deno, v8, typescript } = JSON.parse(stdout);

        return {
          deno,
          v8,
          typescript,
          raw: `deno: ${deno}\nv8: ${v8}\ntypescript: ${typescript}`,
        };
      }
    } catch {
      /* istanbul ignore next */
      return;
    }
  }
  public enableUnstableMode(unstable: boolean) {
    this.unstable = unstable;
  }
  public changeDenoDir(DENO_DIR: string) {
    this._DENO_DIR = DENO_DIR;
  }
  public isDenoCachedModule(filepath: string): boolean {
    filepath = normalizeFilepath(filepath);
    return filepath.startsWith(this.DENO_DIR);
  }
  public convertURL2Filepath(url: URL): string {
    return path.join(
      this.DENO_DEPS_DIR,
      url.protocol.replace(/:$/, ""), // https: -> https
      url.hostname,
      hashURL(url)
    );
  }
  // format code
  // echo "console.log(123)" | deno fmt -
  public async format(code: string): Promise<string | void> {
    /* istanbul ignore if */
    if (!this.executablePath) {
      return;
    }

    const reader = Readable.from([code]);

    const subprocess = execa(this.executablePath, ["fmt", "-"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    const formattedCode = (await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      subprocess.on("exit", (exitCode: number) => {
        /* istanbul ignore if */
        if (exitCode !== 0) {
          reject(new Error(stderr));
        } else {
          resolve(stdout);
        }
      });
      subprocess.on("error", (err: Error) => {
        /* istanbul ignore next */
        reject(err);
      });

      /* istanbul ignore next */
      subprocess.stdout?.on("data", (data: Buffer) => {
        stdout += data;
      });

      /* istanbul ignore next */
      subprocess.stderr?.on("data", (data: Buffer) => {
        /* istanbul ignore next */
        stderr += data;
      });

      subprocess.stdin && reader.pipe(subprocess.stdin);
    })) as string;

    return formattedCode;
  }
}

const deno = new Deno();

export { deno };
