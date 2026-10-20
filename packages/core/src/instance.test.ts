// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Instances by their origin (DR-127): the canonical origin and folder a
// URL names, every URL the origin rule refuses, and keys naming the
// instance by its folder.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalOrigin,
  instanceFolder,
  instanceSegmentOf,
  isInstanceFolder,
  OriginRefused,
  parseOrigin,
  type OriginRefusal,
} from "./instance.js";
import { splitKey } from "./home.js";
import type { HostRepository } from "./git-host.js";
import { REPOSITORY_KEY_PATTERN } from "./protocol.js";
import { hostKey } from "./space-groups.js";

// input, canonical origin, folder
const CANONICAL: Array<[string, string, string]> = [
  ["https://spex.pub", "https://spex.pub", "@spex.pub"],
  ["https://spex.pub/", "https://spex.pub", "@spex.pub"],
  ["  https://spex.pub  ", "https://spex.pub", "@spex.pub"],
  ["HTTPS://Spex.Pub", "https://spex.pub", "@spex.pub"],
  ["https://spex.pub:443/", "https://spex.pub", "@spex.pub"],
  ["https://spex.pub:0443", "https://spex.pub", "@spex.pub"],
  ["https://spex.pub:08443", "https://spex.pub:8443", "@spex.pub_8443"],
  ["https://spex.pub:65535", "https://spex.pub:65535", "@spex.pub_65535"],
  ["https://a-b.c-d.example:1", "https://a-b.c-d.example:1", "@a-b.c-d.example_1"],
  ["https://internal.spex.pub", "https://internal.spex.pub", "@internal.spex.pub"],
  ["https://spex.pub:8443", "https://spex.pub:8443", "@spex.pub_8443"],
  ["https://bücher.example", "https://xn--bcher-kva.example", "@xn--bcher-kva.example"],
  ["https://127.0.0.1:4100", "https://127.0.0.1:4100", "@127.0.0.1_4100"],
  ["http://127.0.0.1:4100", "http://127.0.0.1:4100", "@127.0.0.1_4100"],
  ["http://127.0.0.1:4100/", "http://127.0.0.1:4100", "@127.0.0.1_4100"],
  ["http://127.0.0.1", "http://127.0.0.1", "@127.0.0.1_80"],
  ["http://127.0.0.1:80", "http://127.0.0.1", "@127.0.0.1_80"],
  ["http://127.1:4100", "http://127.0.0.1:4100", "@127.0.0.1_4100"],
  ["http://127.255.3.9:4100", "http://127.255.3.9:4100", "@127.255.3.9_4100"],
  ["http://localhost:4100", "http://localhost:4100", "@localhost_4100"],
  ["HTTP://LocalHost", "http://localhost", "@localhost_80"],
];

test("instance origins: each URL names one canonical origin and one folder", () => {
  for (const [input, origin, folder] of CANONICAL) {
    assert.equal(canonicalOrigin(input), origin, input);
    assert.equal(instanceFolder(input), folder, input);
    // The canonical origin is a fixed point and names the same folder.
    assert.equal(canonicalOrigin(origin), origin, origin);
    assert.equal(instanceFolder(origin), folder, origin);
    assert.ok(isInstanceFolder(folder), folder);
  }
});

test("instance origins: parseOrigin gives the scheme, host and a port only where it is not the default", () => {
  assert.deepEqual(parseOrigin("https://Spex.Pub:443/"), { origin: "https://spex.pub", scheme: "https", host: "spex.pub", port: null });
  assert.deepEqual(parseOrigin("https://spex.pub:8443"), { origin: "https://spex.pub:8443", scheme: "https", host: "spex.pub", port: 8443 });
  assert.deepEqual(parseOrigin("http://localhost:80"), { origin: "http://localhost", scheme: "http", host: "localhost", port: null });
  assert.deepEqual(parseOrigin("http://127.0.0.1:4100"), { origin: "http://127.0.0.1:4100", scheme: "http", host: "127.0.0.1", port: 4100 });
});

const REFUSED: Array<[string, OriginRefusal]> = [
  ["", "invalid"],
  ["spex.pub", "invalid"],
  ["not a url", "invalid"],
  ["http://", "invalid"],
  ["ftp://spex.pub", "scheme"],
  ["ssh://git@spex.pub", "scheme"],
  ["file:///tmp/spex", "scheme"],
  ["https://me@spex.pub", "user"],
  ["https://me:secret@spex.pub", "user"],
  ["https://:secret@spex.pub", "user"],
  ["https://spex.pub/acme", "path"],
  ["https://spex.pub/api/v1/", "path"],
  ["https://spex.pub//", "path"],
  ["https://spex.pub?tab=groups", "query"],
  ["https://spex.pub/?", "query"],
  ["https://spex.pub/#top", "fragment"],
  ["https://spex.pub#", "fragment"],
  ["https://my_host.example", "host"],
  ["https://spex*pub", "host"],
  ["https://spex..pub", "host"],
  ["https://.spex.pub", "host"],
  ["https://spex.pub.", "host"],
  ["https://-spex.pub", "host"],
  ["https://spex-.pub", "host"],
  ["https://spex.-pub", "host"],
  ["https://spex.pub:0", "port"],
  ["http://127.0.0.1:0", "port"],
  ["http://[::1]:4100", "host"],
  ["https://[::1]", "host"],
  ["http://spex.pub", "insecure"],
  ["http://192.168.1.2:4100", "insecure"],
  ["http://128.0.0.1", "insecure"],
  ["http://foo.localhost", "insecure"],
  ["http://localhost.example", "insecure"],
];

test("instance origins: every URL outside the origin rule is refused with its reason", () => {
  for (const [input, reason] of REFUSED) {
    for (const parse of [parseOrigin, canonicalOrigin, instanceFolder]) {
      assert.throws(() => parse(input), (error: unknown) => {
        assert.ok(error instanceof OriginRefused, `${input}: ${String(error)}`);
        assert.equal(error.reason, reason, input);
        assert.equal(error.name, "OriginRefused");
        return true;
      }, input);
    }
  }
  // A refusal never repeats the URL, which may carry a secret.
  assert.throws(() => parseOrigin("https://me:secret@spex.pub"), (error: unknown) =>
    error instanceof Error && !error.message.includes("secret") && !error.message.includes("spex.pub"));
});

test("instance folders: only `@<host>` with an optional `_<port>` stands as one, the host DNS labels and the port 1 to 65535 with no leading zero", () => {
  for (const folder of ["@spex.pub", "@internal.spex.pub", "@127.0.0.1_4100", "@localhost_80", "@xn--bcher-kva.example", "@a", "@a-b.c-d", "@spex.pub_1", "@spex.pub_65535"]) {
    assert.ok(isInstanceFolder(folder), folder);
  }
  for (const folder of [
    "spex.pub", "@", "@Spex.pub", "@spex_pub", "@spex.pub_", "@spex.pub_80_1", "@spex.pub_x", "acme", "@spex.pub/acme", "@[::1]_4100",
    // Labels: no empty, leading or trailing one, none starting or ending with `-`.
    "@spex..pub", "@.spex.pub", "@spex.pub.", "@.", "@-spex.pub", "@spex-.pub", "@spex.-pub", "@spex.pub-",
    // Ports: none, none above 65535, none with a leading zero.
    "@spex.pub_0", "@spex.pub_00", "@spex.pub_080", "@spex.pub_65536", "@spex.pub_99999", "@spex.pub_100000",
  ]) {
    assert.ok(!isInstanceFolder(folder), folder);
  }
});

test("instance folders: a key's instance segment is its first segment where that is an instance's folder", () => {
  assert.equal(instanceSegmentOf("@spex.pub/acme/a-spex"), "@spex.pub");
  assert.equal(instanceSegmentOf("@spex.pub/me/me-spex"), "@spex.pub");
  assert.equal(instanceSegmentOf("@127.0.0.1_4100/acme/platform/b-spex"), "@127.0.0.1_4100");
  assert.equal(instanceSegmentOf("me/me-spex"), null);
  assert.equal(instanceSegmentOf("acme/platform/b-spex"), null);
  assert.equal(instanceSegmentOf("a-spex"), null);
  assert.equal(instanceSegmentOf("@spex_pub/a-spex"), null);
});

test("keys: a key splits into its instance's folder, the group path in that instance and its name", () => {
  assert.deepEqual(splitKey("@spex.pub/acme/platform/a-spex"), { instance: "@spex.pub", group: "acme/platform", name: "a-spex" });
  assert.deepEqual(splitKey("@127.0.0.1_4100/ada/x-spex"), { instance: "@127.0.0.1_4100", group: "ada", name: "x-spex" });
  assert.deepEqual(splitKey("@spex.pub/a-spex"), { instance: "@spex.pub", group: "", name: "a-spex" });
  // Your own group's and the local-only clones lie outside every
  // instance's folder.
  assert.deepEqual(splitKey("me/me-spex"), { instance: null, group: "me", name: "me-spex" });
  assert.deepEqual(splitKey("acme/platform/b-spex"), { instance: null, group: "acme/platform", name: "b-spex" });
  assert.deepEqual(splitKey("a-spex"), { instance: null, group: "", name: "a-spex" });
  // Every folder an origin names stands as a key's first segment.
  for (const [input, , folder] of CANONICAL) {
    const key = `${instanceFolder(input)}/acme/a-spex`;
    assert.ok(REPOSITORY_KEY_PATTERN.test(key), key);
    assert.deepEqual(splitKey(key), { instance: folder, group: "acme", name: "a-spex" });
  }
});

test("keys: a listed repository's key is its path in the instance, under the instance's folder where one is named", () => {
  const listed = (fullPath: string, path: string): HostRepository => ({
    id: "17", name: path, path, remoteUrl: "", visibility: "private", archived: false, empty: false, lfs: false, spexBranch: true, project: null,
    group: { id: "3", fullPath, name: fullPath, kind: "group", can: { createSubgroup: false, manageMembers: false, rename: false, delete: false } },
    can: { manageMembers: false, transfer: false },
  });
  assert.equal(hostKey(listed("acme/platform", "a-spex")), "acme/platform/a-spex");
  assert.equal(hostKey(listed("acme/platform", "a-spex"), "@spex.pub"), "@spex.pub/acme/platform/a-spex");
  assert.equal(hostKey(listed("ada", "x-spex"), "@127.0.0.1_4100"), "@127.0.0.1_4100/ada/x-spex");
  // A path that cannot stand as a key, a path beginning with `@`, or a
  // name that is no instance's folder takes none.
  assert.equal(hostKey(listed("acme", "a"), "@spex.pub"), null);
  assert.equal(hostKey(listed("@spex.pub", "a-spex")), null);
  assert.equal(hostKey(listed("@spex.pub/acme", "a-spex"), "@spex.pub"), null);
  assert.equal(hostKey(listed("acme", "a-spex"), "spex.pub"), null);
  assert.equal(hostKey(listed("acme", "a-spex"), "@Spex.pub"), null);
});
