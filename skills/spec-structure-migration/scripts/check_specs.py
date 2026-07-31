#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
"""Mechanical conformance checker for the current spec-structure generation.

Usage: check_specs.py <spec-tree> [<spec-tree> ...]

A spec tree is a directory laid out like specs/ (decisions/, intents/,
packages/, map.md, meta.md). For each tree this reports:

  1. relative markdown links that do not resolve (file and anchor)
  2. item citations not in the enclosed form [[<id>](path#<id>)] with the
     link text equal to the target item ID
  3. ALLCAPS item-ID residue outside code (record IDs DR-/IR- exempt)
  4. package files with unexpected sections or sections out of order
  5. DR/IR files missing required sections
  6. behavior items citing a peer package's non-External item (meta-19);
     Verification items are outside this check — the law is silent on a
     test reaching peer Internal Behavior, so it is tolerated
  7. IR references in DR or spec-item files — decisions/, packages/,
     meta.md (meta-26); intent records and map.md are exempt
  8. leftover compositions/ directories

Exit 0 when clean, 1 when any problem is found. The checker is a guardrail,
not the law: passing it does not prove conformance — meta.md does.
"""
import os
import re
import sys
import unicodedata

problems = []


def report(root, path, line, msg):
    problems.append(f"{os.path.relpath(path, root)}:{line}: {msg}")


def gh_anchor(heading):
    h = heading.strip().lower()
    h = re.sub(r"[`*_~]", "", h)
    out = []
    for ch in h:
        cat = unicodedata.category(ch)
        if ch == " ":
            out.append("-")
        elif ch in "-_" or not (cat.startswith("P") or cat.startswith("S")):
            out.append(ch)
    return "".join(out)


def strip_code(text):
    lines, out, fence = text.split("\n"), [], None
    for ln in lines:
        m = re.match(r"^\s*(`{3,}|~{3,})", ln)
        if fence:
            out.append("")
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
                fence = None
            continue
        if m:
            fence = m.group(1)
            out.append("")
            continue
        out.append(re.sub(r"`[^`]*`", "``", ln))
    return out


ITEM_ANCHOR = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$")
LINK = re.compile(r"\[([^\[\]]*)\]\(([^)\s]+)\)")
# The (?!\.\d) guard keeps version-numbered names (GPT-5.6) from
# reading as item-id residue.
ALLCAPS = re.compile(r"\b([A-Z][A-Z0-9]{1,})-(\d+)(?!\.\d)\b")
ALLCAPS_EXEMPT = {"DR", "IR", "SHA", "SA", "LICENSE", "UTF", "ISO", "RFC", "CC", "BY"}

SECTION = re.compile(r"^## (.+)$")
PKG_ORDER = ["Intent", "External Behavior", "Internal Behavior", "Verification", "References",
             "意图", "外部行为", "内部行为", "验证", "参考资料"]
EXTERNAL = {"External Behavior", "外部行为"}
BEHAVIOR = {"External Behavior", "Internal Behavior", "外部行为", "内部行为"}
DR_REQUIRED = [("Status", "状态"), ("Context", "背景"), ("Decision", "决策"), ("Consequences", "影响")]
IR_REQUIRED = [("Status", "状态"), ("Intent", "意图"), ("Deliverables", "交付项"),
               ("Tasks", "任务"), ("Verification", "验证")]


def pkg_rank(section):
    name = section if section in PKG_ORDER else None
    if name is None:
        return None
    return PKG_ORDER.index(name) % 5


def check_tree(root):
    files = {}
    for dirpath, dirnames, filenames in os.walk(root):
        if "compositions" in dirnames:
            report(root, os.path.join(dirpath, "compositions"), 0,
                   "compositions/ directory still exists")
        for f in filenames:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dirpath, f)
            text = open(p, encoding="utf-8").read()
            anchors, seen = set(), {}
            for ln in strip_code(text):
                m = re.match(r"^(#{1,6})\s+(.*)$", ln)
                if m:
                    a = gh_anchor(m.group(2))
                    n = seen.get(a, 0)
                    seen[a] = n + 1
                    anchors.add(a if n == 0 else f"{a}-{n}")
            files[p] = (text, anchors)

    def section_map(text):
        sec, out = None, {}
        for ln in strip_code(text):
            m = SECTION.match(ln)
            if m:
                sec = m.group(1).strip()
                continue
            m = re.match(r"^#{3,6}\s+(.*)$", ln)
            if m and sec:
                out[gh_anchor(m.group(1))] = sec
        return out

    sections_by_file = {p: section_map(t) for p, (t, _a) in files.items()}

    for path, (text, _anchors) in sorted(files.items()):
        rel = os.path.relpath(path, root)
        lines = strip_code(text)
        is_pkg = rel.startswith("packages" + os.sep) or rel == "meta.md"
        # meta-26 binds DRs and spec items alone; intent records and
        # map.md sit outside the prohibition.
        names_no_ir = is_pkg or rel.startswith("decisions" + os.sep)
        cur_sec = None
        for i, ln in enumerate(lines, 1):
            msec = SECTION.match(ln)
            if msec:
                cur_sec = msec.group(1).strip()
            if names_no_ir:
                for m in re.finditer(r"\bIR-\d+\b", ln):
                    report(root, path, i, f"IR reference in a DR or spec item (meta-26): {m.group(0)}")
            for m in LINK.finditer(ln):
                txt, target = m.group(1), m.group(2)
                if re.match(r"^[a-z]+:|^//", target):
                    continue
                frag = None
                if "#" in target:
                    target, frag = target.split("#", 1)
                tp = path if target == "" else os.path.normpath(
                    os.path.join(os.path.dirname(path), target))
                if target and not os.path.exists(tp):
                    report(root, path, i, f"broken link: {m.group(0)} -> missing file")
                    continue
                if frag is not None:
                    entry = files.get(tp)
                    if entry is None:
                        continue
                    if frag not in entry[1]:
                        report(root, path, i, f"dangling anchor: {m.group(0)}")
                        continue
                    if ITEM_ANCHOR.match(frag):
                        pre, post = ln[: m.start()], ln[m.end():]
                        if not (pre.endswith("[") and post.startswith("]")):
                            report(root, path, i,
                                   f"item citation not enclosed [[..]]: {m.group(0)}")
                        if txt != frag:
                            report(root, path, i,
                                   f"citation text != target id: [{txt}] -> #{frag}")
                        if is_pkg and tp != path and \
                                os.path.relpath(tp, root).startswith("packages" + os.sep):
                            tsec = sections_by_file.get(tp, {}).get(frag)
                            if cur_sec in BEHAVIOR and tsec and tsec not in EXTERNAL:
                                report(root, path, i,
                                       f"behavior item cites peer non-External ({tsec}): "
                                       f"{m.group(0)} (meta-19)")
            for m in ALLCAPS.finditer(ln):
                if m.group(1) not in ALLCAPS_EXEMPT:
                    report(root, path, i, f"ALLCAPS item-id residue: {m.group(0)}")

    for path, (text, _a) in sorted(files.items()):
        rel = os.path.relpath(path, root)
        secs = [m.group(1).strip() for ln in strip_code(text) for m in [SECTION.match(ln)] if m]
        if rel.startswith("packages" + os.sep):
            ranks = [pkg_rank(s) for s in secs if pkg_rank(s) is not None]
            bad = [s for s in secs if pkg_rank(s) is None]
            if bad:
                report(root, path, 0, f"unexpected package sections: {bad}")
            if ranks != sorted(ranks):
                report(root, path, 0, f"package sections out of order: {secs}")
            for req in (0, 1):  # Intent, External Behavior
                if req not in ranks:
                    report(root, path, 0,
                           f"package missing required section {PKG_ORDER[req]}")
        elif rel.startswith("decisions" + os.sep):
            missing = [en for en, zh in DR_REQUIRED if en not in secs and zh not in secs]
            if missing:
                report(root, path, 0, f"DR missing sections: {missing}")
        elif rel.startswith("intents" + os.sep):
            missing = [en for en, zh in IR_REQUIRED if en not in secs and zh not in secs]
            if missing:
                report(root, path, 0, f"IR missing sections: {missing}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    for tree in sys.argv[1:]:
        if not os.path.isdir(tree):
            print(f"not a directory: {tree}")
            return 2
        check_tree(os.path.abspath(tree))
    print(f"{len(problems)} problem(s)")
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
