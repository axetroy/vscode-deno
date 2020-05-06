import { init, localize } from "vscode-nls-i18n";

// init i18n
init(process.env.VSCODE_DENO_EXTENSION_PATH + "");

import { promises as fs } from "fs";

import {
  IPCMessageReader,
  IPCMessageWriter,
  createConnection,
  IConnection,
  TextDocuments,
  InitializeResult,
  TextDocumentSyncKind,
  CodeActionKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as semver from "semver";

import { Bridge } from "./bridge";
import { DependencyTree } from "./dependency_tree";
import { Diagnostics } from "./language/diagnostics";
import { Definition } from "./language/definition";
import { References } from "./language/references";
import { DocumentHighlight } from "./language/document_highlight";
import { DocumentFormatting } from "./language/document_formatting";
import { Hover } from "./language/hover";
import { Completion } from "./language/completion";
import { CodeLens } from "./language/code_lens";

import { deno, Version } from "../../core/deno";
import { pathExists } from "../../core/util";
import { Notification } from "../../core/const";

const SERVER_NAME = "Deno Language Server";
process.title = SERVER_NAME;

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: IConnection = createConnection(
  new IPCMessageReader(process),
  new IPCMessageWriter(process)
);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents = new TextDocuments(TextDocument);

const bridge = new Bridge(connection);
new DependencyTree(connection, bridge);
new Diagnostics(SERVER_NAME, connection, bridge, documents);
new Definition(connection, documents);
new References(connection, documents);
new DocumentHighlight(connection, documents);
new DocumentFormatting(connection, documents);
new Hover(connection, documents);
new Completion(connection, documents);
new CodeLens(connection, documents);

connection;

connection.onInitialize(
  (): InitializeResult => {
    return {
      capabilities: {
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Full,
        },
        completionProvider: {
          triggerCharacters: ["http", "https"],
        },
        codeActionProvider: {
          codeActionKinds: [CodeActionKind.QuickFix],
        },
        documentHighlightProvider: true,
        hoverProvider: true,
        referencesProvider: true,
        definitionProvider: true,
        codeLensProvider: {},
      },
    };
  }
);

async function ensureDenoDts(unstable: boolean) {
  const originUnstableMode = deno.unstable;
  deno.enableUnstableMode(unstable);

  try {
    const currentDenoTypesContent = deno.TYPE as Buffer;

    const denoDtsFile = deno.TYPE_FILE;
    const isExistDtsFile = await pathExists(denoDtsFile);

    // if dst file not exist. then create a new one
    if (!isExistDtsFile) {
      await fs.writeFile(denoDtsFile, currentDenoTypesContent, { mode: 0o444 });
    } else {
      // set it to writable
      await fs.chmod(denoDtsFile, 0o666);

      const typesContent = await fs.readFile(denoDtsFile, { encoding: "utf8" });

      if (typesContent.toString() !== currentDenoTypesContent.toString()) {
        await fs.writeFile(denoDtsFile, currentDenoTypesContent, {
          mode: 0o444,
        });

        // set to readonly
        await fs.chmod(denoDtsFile, 0o444);
      }
    }
  } finally {
    deno.enableUnstableMode(originUnstableMode);
  }
}

connection.onInitialized(async () => {
  let version: Version | void;
  try {
    version = deno.version;

    if (!version) {
      throw new Error(localize("err.not_install_deno"));
    }

    // If the currently used Deno is less than 0.33.0
    // We will give an warning to upgrade.
    const minimumDenoVersion = "0.35.0";
    if (!semver.gte(version.deno, minimumDenoVersion)) {
      throw new Error(
        localize("err.below_deno_minimum_requirements", minimumDenoVersion)
      );
    }

    await ensureDenoDts(false);
    await ensureDenoDts(true);
  } catch (err) {
    connection.sendNotification(Notification.error, err.message);
    return;
  }
  connection.sendNotification(Notification.init, {
    version: version,
    executablePath: deno.executablePath,
    DENO_DIR: deno.DENO_DIR,
  });
  connection.console.log("server initialized.");
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
