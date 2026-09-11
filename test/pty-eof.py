#!/usr/bin/env python3
"""Drive ./bootstrap over a real pty (readline only treats Ctrl-D as EOF in
raw TTY mode, so a piped stdin can't reproduce this). Answers prompts up to
BREAK_AT, then sends Ctrl-D (0x04) instead of an answer for it.

Usage: pty-eof.py <cwd> <break_at>
break_at is one of: url, pw, name, note, relme

Prints one JSON line: {"status": <exit code>, "output": <everything read>}
"""
import json
import os
import pty
import select
import sys
import time

ORDER = ["url", "pw", "name", "note", "relme"]


def read_until(fd, marker, timeout=15):
    buf = b""
    end = time.time() + timeout
    marker_b = marker.encode()
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.5)
        if fd not in r:
            continue
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
        if marker_b in buf:
            break
    return buf


def drain(fd, quiet_for=1.5, timeout=10):
    buf = b""
    end = time.time() + timeout
    last_data = time.time()
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.3)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            last_data = time.time()
        elif time.time() - last_data > quiet_for:
            break
    return buf


def main():
    cwd, break_at = sys.argv[1], sys.argv[2]
    idx = ORDER.index(break_at)
    env = os.environ.copy()
    for k in ("INDIEKIT_PASSWORD", "INDIEKIT_SITE_URL", "INDIEKIT_AUTHOR_NAME"):
        env.pop(k, None)

    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        os.execvpe("./bootstrap", ["./bootstrap"], env)
        os._exit(127)

    full = b""

    def step(marker, text):
        nonlocal full
        full += read_until(fd, marker)
        if text is not None:
            os.write(fd, text.encode())

    def eof():
        os.write(fd, b"\x04")

    step("Site URL", None)
    eof() if break_at == "url" else os.write(fd, b"http://eoftest.localhost\n")

    step("Password for the admin interface", None)
    if break_at == "pw":
        eof()
    else:
        os.write(fd, b"longenoughpw1\n")
        step("Again", None)
        os.write(fd, b"longenoughpw1\n")

    if idx > ORDER.index("pw"):
        step("Site name", None)
        if break_at == "name":
            eof()
        else:
            os.write(fd, b"\n")
            step("Description", None)
            os.write(fd, b"\n")
            step("Timezone", None)
            os.write(fd, b"\n")
            step("Your name", None)
            os.write(fd, b"\n")
            step("Your URL", None)
            os.write(fd, b"\n")

    if idx > ORDER.index("name"):
        step("A line about you", None)
        eof() if break_at == "note" else os.write(fd, b"\n")

    if idx > ORDER.index("note"):
        step("rel=me links", None)
        eof() if break_at == "relme" else os.write(fd, b"\n")

    full += drain(fd)

    try:
        _, status = os.waitpid(pid, 0)
        code = os.waitstatus_to_exitcode(status)
    except ChildProcessError:
        code = None

    print(json.dumps({"status": code, "output": full.decode(errors="replace")}))


if __name__ == "__main__":
    main()
