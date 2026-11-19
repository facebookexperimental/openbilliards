#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

r"""audit-unquoted-cleanup.py — ADVISORY — NOT A GATE (COMPANION-1d: the LAST-HELPER-ROUND contingency, invoked by review round 3 on
#761, 2026-09-12). This is a hand-rolled shell LEXER, not a parser: three review rounds found 8 + 6 + 4 silent zero-row acceptances
against it after every fold, so it no longer gates anything. It prints its rows, its refusals and the resolved root exactly as
before and EXITS 0 in every case except a usage error (a path outside --root, a missing file, an empty file set, an unwritable
--json, a git-less --all-repo). The class-A GATE for the unquoted-cleanup class is `arms-companion1.sh literal-cleanup` through the
real entry point (both exits) plus the array-quoted scripts themselves (arms-fix3/8/9/10/11); the battery keeps this report as a
RECORD row (the count printed, never red).

KNOWN BLIND SPOTS — spellings this lexer certifies as 0 rows although bash runs the cleanup over the split list (verbatim; NOT folded,
by order — the list is the honesty of the report):
  review round 3 on #761 (the demotion round):
  · a callee defined BEFORE the loop that reads the split loop name as a FREE variable: `cleanup(){ rm -f "$item"; }` then
    `for item in $LIST; do cleanup; done` — the consumer check examines call arguments only;
  · a local declaration that COPIES its value inside the loop: `for item in $LIST; do local item="$item"; rm -f "$item"; done`
    (and `declare -g`) — the declared name is masked unconditionally;
  · substitutions inside `(( ))` arithmetic commands and arithmetic-loop initialisers: `(( n = $(rm -f $TARGET; echo 1) ))` —
    the arithmetic command is stored as an opaque word, its substitutions are not collected (unlike `$(( ))`);
  · wrapper options that take an argument: `sudo --user root rm -rf $TARGET`, `env --unset NAME rm -rf $TARGET` — `--user` /
    `--unset` are skipped without consuming their operand, which is then mistaken for the command, and the unknown-command
    validation runs before the wrapper is removed.
  the FIX2k Fable lens (§COMPANION-1c open rows 6–9): the free-variable route above (a zero since FIX1, never claimed); `declare -g w` /
  `typeset -g w` and an initialiser reading the name (`local w="$w"`) masking a frame bash keeps reachable; a `local w` declared
  AFTER the loop in the same body ending the frame at `}`; `su root arg -c body` (a stray operand between the login and -c) ending
  the scan silently; over-reports (a frame born in a subshell / pipeline element is kept; an in-body `read` masks for the body
  although bash rebinds the global).
  the families found and folded in rounds 1–2 (closed on this tree, listed so a reader knows the shape of the class): definitions
  after a separator or led by a keyword / an assignment / `time`; `bash -ce`; a variable trap body; a consumer through a
  substitution; `bash -c -- body` / `bash -- -c`; positional aliases (local / array / `for x in "$@"` / bare for / `${1:?}`);
  one-line `for x do CMD; done` bodies; `${!#}` / getopts / select; dispatchers (`run(){ "$@"; }`, the `--` slot, droppers);
  unknown commands handed a cleanup word; printf/echo `--` pseudo-strippers; su option order; `env -S`; loop variables read after
  `done`; the launcher/scoping edge cases each lens then found behind the previous fold.
  undetectable by design (stated class boundary): data reaching a cleanup through stdin, a pipe or a file (`… | xargs rm`,
  `while read x; do rm "$x"; done`); an alias assigned inside a loop (`b="$a"`); a callee defined in another file; a command
  word that only resolves to rm at run time (brace / glob / case-insensitive PATH); an unknown external command handed literal
  operands.

ORIGINAL CONTRACT (COMPANION-1 class A — review round 12 on #731, P2; review round 1 on #761, 8 × P2 + 1 × P3), kept below as the
description of what the report reads:
cleanup / teardown / kill targets are literal paths, never a word-split list — and a hand-rolled lexer that says
"0 rows" fails closed on the constructs it recognises as outside its subset (a REFUSAL by name; since COMPANION-1d a refusal
is printed and the exit stays 0).

Lists `file:line` for every `rm | rmdir | mv | cp | kill` whose ARGUMENTS carry an unquoted expansion —
`$VAR`, `${...}`, `$(...)`, `` `...` ``, `$*` / `$@` / `$1` — the spelling that let arms-fix8.sh:11's EXIT trap
(`rm -f $PLANTED`) delete a sentinel `/tmp/run` when OB_ARM_ASM490_DIR carried a space.  The lexer follows the
command into `trap '...'` bodies (single-, double- and ANSI-C-quoted, escapes decoded), `bash|sh|zsh|dash|ksh -c`
strings (also `-lc` / `-ec` option clusters), `su -c`, `eval` strings, the bodies of `$(...)`, backtick, `<(...)`
and `>(...)` substitutions wherever they sit (a word, a double-quoted string, a `${var:-...}` fallback, an array
assignment, a redirect target), the `-exec` / `-execdir` / `-ok` / `-okdir` lists of `find` (classified like any
command: wrappers and shells included), the command behind `xargs` / `sudo` / `doas` / `command` / `builtin` /
`exec` / `env` / `nice` / `nohup` / `timeout` / `time` / `stdbuf` / `caffeinate`, a command spelled by absolute
path (`/bin/rm`), the words after `--` of a function defined in the same file (a `"$@"` dispatcher such as the
battery's `step`), heredoc bodies that feed a shell (`bash <<'EOF'`, `cat <<'EOF' | bash`) or are written to a
`*.sh` / `*.bash` / `*.zsh` target (redirect or `tee`), the `$( )` / backtick / `${ }` bodies of a heredoc with an UNQUOTED delimiter
(they expand in the outer shell whatever the target), a call that splits a list into a same-file function or a `-c` body that runs a
cleanup over its positional parameters (`cleanup(){ rm -f "$@"; }; cleanup $LIST` — a row at the call; a function that only forwards its
positionals to such a consumer is a consumer too, computed to a fixpoint), and the same split spelled through a loop
(`for f in $LIST; do ... rm -f "$f"; done` — the list was split at the `for`; the frame follows the variable into
nested loops, substitution bodies, trap / -c / eval bodies and `find -exec` lists).  shellcheck is absent on this
host and is not to be installed.

  python3 tools/render/lib/audit-unquoted-cleanup.py [--root DIR] [--json FILE] [--all-repo] [PATH ...]
    no PATH      every *.sh / *.bash / *.zsh under <root>/tools/render (the lane's shell scripts)
    PATH         a file, or a directory recursed for *.sh / *.bash / *.zsh — RELATIVE paths resolve from the
                 current directory; anything that resolves outside <root> is refused by name
    --root DIR   the tree under audit (default: the tree this helper file sits in); printed on the verdict line
    --all-repo   every tracked *.sh / *.bash / *.zsh in the repo (git ls-files; a checkout, not an export)
    --json FILE  the rows as JSON ({file, line, command, expansions, context})
  exit 0 on zero rows, 1 on one or more rows, 2 on a REFUSAL.
  On exit 0 / 1 the last line is `[audit-unquoted-cleanup] N rows over M files under <root>`.

SUPPORTED SUBSET (COMPANION-1c, review round 2 on #761 — the helper certifies ONLY this grammar; anything it can recognise
outside it is REFUSED by name, never certified):
  · simple commands split on newline ; & | ( ) with leading NAME=… assignments and the keywords if then else elif do ! { }
  · loops: for NAME in WORDS / for (( )) / select / while COND / until COND … done (depth tracked; a done without a loop
    or a loop never closed = refusal); case … in … esac and if … fi are read as plain commands
  · function definitions AT LINE START ONLY: `name() {` / `name () {` / `function name {` / `function name() {` (the brace
    may sit on the next line); a definition after ; { } && || | then do else elif ! or after an assignment on its line, and a
    subshell body `name() (` = refusal
  · quoting: '…', "…" (with \ escapes, $( ) ${ } `…` inside), $'…' (escapes decoded: \n \t \r \a \b \e \f \v \\ \' \" \xHH
    \nnn \uHHHH \UHHHHHHHH), \-escapes, ; # comments at a word start, `#` after whitespace inside $( ) and array bodies
  · expansions: $NAME ${…} (bodies scanned for substitutions; bare parentheses in braces are text) $( ) `…` <( ) >( )
    $(( )) (a scalar) $* $@ $N $- $0 (word-splitting specials) and $$ $! $? $# (scalars); NAME=( … ) array assignments
  · redirections: > >> < <& >& &> 2>&1 <<< (targets not judged; their substitutions are); heredocs << <<- with a quoted or
    unquoted delimiter (an unquoted delimiter's $( ) `…` ${ } bodies run in the outer shell and are analysed; a body is
    read as shell when it feeds a shell, is redirected or tee'd to *.sh *.bash *.zsh, or is piped into a shell)
  · guarded commands rm rmdir mv cp kill, spelled bare, by absolute path, or behind command builtin exec sudo doas env
    nice nohup timeout time stdbuf caffeinate xargs (each wrapper's own options stepped over)
  · nested bodies: trap with a LITERAL body only ('…' or a bare word; a body carrying any expansion = refusal),
    bash sh zsh dash ksh su with -c anywhere in a single-dash option cluster (-c -ce -lc -xc …; `-c -- body` read; for su
    the shape read is `su [-] [-l -m -p -P -f] [--] [login] -c body` — any other su option (-s SHELL, -g GROUP, --shell,
    --command …) = refusal; `env -S string` re-splits a string = refusal; long
    options --norc --posix --login --verbose … skipped, --rcfile/--init-file/-o/-O with their argument; any other -word,
    and an operand spelled like an option after `--`, = refusal),
    eval with literal text (a body that is only expansions = refusal), find -exec -execdir -ok -okdir lists, the command
    a dispatcher hands on (see the split routes)
  · the split reaching a guarded command through: a for-split frame (inherited by every nested body, and surviving `done` —
    bash keeps the loop variable's last fragment — until a NEW `for` / `select` binds the name, or a top-level `read` /
    mapfile / readarray does (also as a `while read -r w` condition); inside a function body a `local` / `declare` /
    `read` of the name masks the frame for that body only, and a loop inside a body over a name local to it ends with
    the body; a plain or conditional assignment, `unset`, `printf -v` and `(( ))` do NOT end a frame — a later cleanup over
    the name reads as a reviewable row, never a silent zero; an alias assigned inside the loop (`b="$a"`) is not
    followed); a SAME-FILE FUNCTION
    handed an unquoted list or a for-split loop variable — a row at the call site unless the body is INERT, the one thing
    the subset proves about a body: every command a literal word that is neither guarded, a shell, a wrapper, eval / source /
    trap / find / xargs / exec / command / builtin / set nor a dispatcher, every same-file callee inert (fixpoint), no
    heredoc, every substitution inert (a body that runs a cleanup over its positionals is named as a consumer — followed
    through substitutions and nested bodies to a fixpoint; any other non-inert body is named as such; unknown = not inert;
    the remedy is the class's own: quote the call or hold the list in an array expanded quoted); a -c BODY handed a list is
    a row whatever the body; a DISPATCHER — a function whose command word is a positional (`run(){ "$@"; }`, `step … --
    "$@"`, or forwarding "$@" into a dispatcher) — has its call judged as the command it dispatches (the words after the
    call's `--` at the dispatcher's SLOT — after the fixed arguments its body shifts away before its `--` test (`shift 3;
    [ "$1" = -- ] && shift` → slot 3) — when the dispatcher itself strips one (a strip is ONE `--` TEST on `$1` guarding a
    single shift: `[ "$1" = -- ] && shift`, `if [ … ]; then shift; fi`, `case "$1" in --) shift`; never a `--` printed by
    echo / printf); a `--` anywhere else in the call belongs to the dispatched command; a slot without `--` behind fixed
    arguments = refusal; ANY other shift — after the strip, conditional, `shift $n`, a test on `$2`, `shift 2` under the
    test — or `"${@:N}"` dispatched makes the dispatcher a DROPPER and every call a refusal — else all its arguments; a dispatcher that drops arguments — a shift, or `"${@:N}"` as its command
    word — called without `--` = refusal): `run $CMD` is a refusal (a command held in a variable), `run rm -f -- "$T"`
    reads as rm does, `run -- rm -f $L` through a non-stripping dispatcher runs the command `--` (nothing) and is refused
    as an unknown command handed a cleanup word; a one-line `for NAME do CMD; done` / `select NAME do CMD; done` body is judged as the command it
    is (a `( … )` subshell body is split on its parentheses and judged as commands; a body opening `{`, if, case or a
    loop on that line = refusal)
  · class boundary, stated: the class is a word-split EXPANSION in ARGUMENT position of a cleanup; data reaching a
    cleanup through stdin, a pipe or a file (`… | xargs rm`, `while read x; do rm "$x"; done`) is outside what this
    helper judges and is neither certified nor refused by it
  · callees: same-file functions, shell builtins / keywords, commands by path, the guarded set and a stated utility set;
    in a file that `source`s / `.`s another file, any OTHER callee called with an unquoted list = refusal (its definition
    may live in the sourced file)
  LAST HELPER ROUND (the maintainer's ruling, COMPANION-1c): if the companion's next review round finds another silent
  zero-row acceptance, this helper is DEMOTED to advisory — rows printed, exit 0, no battery gate row — and the class
  gate becomes arm-literal-cleanup alone (§COMPANION-1c records the rule).

FAIL CLOSED (the order of COMPANION-1 FIX1): a construct the lexer does not parse with proven semantics is a
REFUSAL by name — the construct and its file:line are printed, exit 2 — never a zero.  Refused: a file that cannot
be read to its end (an unterminated quote / backtick / `$( )` / `${ }` / heredoc, a loop never closed, a `done`
without a loop); `set --` / `set -` over an
unquoted expansion (the positional parameters become a word-split list a later `"$@"` cleanup would consume);
`eval` of a body built elsewhere (`eval "$cmd"`); a `-c` body that is a bare expansion (`bash -c "$CMD"`), empty or
the literal `--`; a
command held in a variable or alias (`$RM -f x`, `alias del='rm -f'`); a remote shell handed a command string
(`ssh host '...'`); a function definition not at line start (after a separator, or led by a keyword, an assignment or
`time` on its line) or with a subshell body; a function defined inside an eval body; a trap body carrying an expansion;
a shell option cluster the subset cannot decode; an unresolvable callee called with an unquoted list in a sourcing file;
an UNKNOWN command word (neither a builtin, a stated utility, a wrapper, a shell, the guarded set nor a same-file function)
handed a cleanup / shell word or its caller's argument vector (`setsid rm -f $L`, `arch -arm64 rm -f $L`, `flock f rm -rf $L`,
`setsid "$@"`) or a variable as its first operand when it is unquoted or followed by more words (`setsid "$DEL" -f $L`, `setsid
$CMD`, `mytool $L`) — the subset cannot tell its operand from a command; a known external command with a list, or an unknown one
handed literal operands or one quoted variable (`mytool --in "$1"`, `mytool "$file"`), stays outside the class;
an empty file set; an unreadable path; an unwritable `--json`.

Scope, stated: a static lexer over shell text, not a shell parser.  A word is judged by its OWN quoting —
`"$LIST"` is quoted and out of this class even when LIST holds several paths (that is a list rebuilt by string
concatenation, which the law forbids at the assignment, not a split at the command); `"${arr[@]}"` is the form
the law asks for.  Numeric scalars that cannot word-split (`$$`, `$!`, `$?`, `$#`, `$((...))`) are not expansions
of the class.  A positional dispatcher (`"$@"` / `"$1"` as the command word) is allowed and stated: the words it
runs are literal on the caller's line, which this file audits (after `--` for functions defined in the same
file).  Undetectable by a static reader and therefore NOT claimed: a list split at an assignment and passed on
quoted (`PLANTED=($LIST)`), a split upstream of a pipe (`echo $LIST | xargs rm -f`), a script generated at run
time and executed later, a heredoc reaching a shell through a variable target, a function defined in ANOTHER file
(sourced) that consumes its positionals.  Heredoc bodies that feed anything
other than a shell (python, JSON) are skipped, so an apostrophe in a python comment cannot open a quote that
swallows the rest of the file.  Redirection targets (`> $LOG`) and here-strings are not cleanup targets and are not
judged (their substitutions are).  `pkill` / `killall` are outside this class (the kill-by-recorded-pid law covers
them by name, not by quoting).
"""
import argparse
import json
import os
import re
import subprocess
import sys

GUARDED = ('rm', 'rmdir', 'mv', 'cp', 'kill')
SHELLS = ('bash', 'sh', 'zsh', 'dash', 'ksh')
WRAPPERS = ('command', 'exec', 'sudo', 'nice', 'nohup', 'builtin', 'env', 'time', 'xargs', 'timeout',
            'caffeinate', 'stdbuf', 'doas')
SKIP_KEYWORDS = ('if', 'then', 'else', 'elif', 'do', '!', '{', '}', 'coproc')
NOT_A_COMMAND = ('for', 'select', 'case', 'function', 'in', 'fi', 'done', 'esac')
LOOP_OPENERS = ('for', 'select', 'while', 'until')
XARGS_OPTS_WITH_ARG = ('-I', '-n', '-P', '-L', '-d', '-s', '-E', '-a', '-J', '-R', '-S')
SUDO_OPTS_WITH_ARG = ('-u', '-g', '-h', '-p', '-C', '-D', '-T', '-U')
ENV_OPTS_WITH_ARG = ('-u', '-C', '-S', '-P')
ASSIGN_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=')
ASSIGN_PREFIX_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=$')
NAME_CH = re.compile(r'[A-Za-z0-9_]')
SPECIAL = set('@*-0123456789')          # word-splitting specials; $$ $! $? $# are numeric scalars (consumed, not rows)
SCALAR_SPECIAL = set('$!?#')
POSITIONAL_CMD_RE = re.compile(r'^"?\$\{?[@*1-9]')
POSITIONAL_VEC_RE = re.compile(r'^"?\$\{?[@*]')          # the caller's whole argument vector: "$@" "$*" "${@:2}" — not a single "$1"
DASH_C = re.compile(r'^-[a-zA-Z]+$')          # a single-dash option cluster; `c` ANYWHERE in it = the next word is the -c body (COMPANION-1c)
SHELL_LONG_OPTS = ('--norc', '--noprofile', '--posix', '--login', '--verbose', '--restricted', '--noediting', '--debugger', '--dump-strings', '--dump-po-strings', '--help', '--version', '-')
SU_FLAGS = ('-l', '-m', '-p', '-P', '-f', '--login', '--preserve-environment', '--fast')
SHELL_LONG_WITH_ARG = ('--rcfile', '--init-file', '-o', '+o', '-O', '+O')
SHELL_BUILTINS = set('echo printf read test [ [[ cd pwd export local declare typeset readonly return exit shift set unset true false : break continue eval exec trap wait let getopts source . type hash ulimit umask pushd popd dirs jobs fg bg times mapfile readarray builtin command enable help history kill logout suspend caller compgen complete shopt bind disown'.split())
UTILITIES = set('node python3 python git grep egrep fgrep sed awk cut tr sort uniq head tail cat ls find diff cmp curl wget lsof ps pgrep sleep date mkdir touch shasum sha256sum md5 md5sum wc tee xargs timeout env basename dirname realpath readlink mktemp stat chmod chown ln tar gzip gunzip zip unzip open osascript jq bc expr seq yes tty stty nohup nice caffeinate stdbuf sudo doas ssh scp rsync ffmpeg ffprobe convert magick shellcheck bash sh zsh dash ksh perl ruby npm npx make column paste join comm fold rev nl od xxd hexdump file which whoami id uname hostname df du'.split())
FUNC_RE = re.compile(r'^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{|^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{', re.M)
EXTS = ('.sh', '.bash', '.zsh')
ANSI = {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', "'": "'", '"': '"', 'a': '\a', 'b': '\b', 'e': '\x1b',
        'E': '\x1b', 'f': '\f', 'v': '\v', '?': '?'}


class Unreadable(Exception):
    """a construct outside the lexer's proven semantics — the file is refused by name, never read as clean"""


class Word:
    __slots__ = ('text', 'parts', 'line', 'unq', 'redirect', 'substs', 'first_kind', 'start')

    def __init__(self, line):
        self.text = ''      # the word as written (quotes kept)
        self.parts = []     # [(kind, inner)] kind in lit | sq | dq — for nested-body extraction
        self.line = line
        self.unq = []       # unquoted expansions found in the word
        self.redirect = False
        self.substs = []    # [(inner, line)] executable substitution bodies found in the word (any quoting)
        self.first_kind = None
        self.start = None

    def add(self, kind, s):
        if self.first_kind is None:
            self.first_kind = kind
        self.text += s if kind == 'lit' else ({'sq': "'", 'dq': '"'}[kind] + s + {'sq': "'", 'dq': '"'}[kind])
        if self.parts and self.parts[-1][0] == kind:
            self.parts[-1] = (kind, self.parts[-1][1] + s)
        else:
            self.parts.append((kind, s))

    def inner(self):
        """the body a nested shell would see: single-quoted parts verbatim, double-quoted parts unescaped."""
        out = []
        for kind, s in self.parts:
            if kind == 'dq':
                s = re.sub(r'\\([\\"$`])', r'\1', s)
            out.append(s)
        return ''.join(out)

    def bare(self):
        return ''.join(s for _, s in self.parts)

    def references(self, pat):
        """does an EXPANDING part (literal or double-quoted; never single-quoted) reference the pattern?"""
        return any(kind != 'sq' and pat.search(s) for kind, s in self.parts)

    def is_pure_expansion(self):
        """the whole word is one expansion (or several) with no literal text — a body / command built elsewhere"""
        b = self.bare().strip()
        return bool(b) and re.fullmatch(r'(\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$[@*])+', b) is not None


class Ctx:
    """per-file state the lexer needs for refusals"""
    __slots__ = ('path', 'sourced')

    def __init__(self, path):
        self.path = path
        self.sourced = False


# ---------------------------------------------------------------- quoting-aware delimiter matching

def _skip_sq(text, i, ctx, line):
    j = text.find("'", i + 1)
    if j < 0:
        raise Unreadable(f"{ctx.path}:{line}: unterminated single quote — the rest of the file would go unread")
    return j + 1


def _skip_backtick(text, i, ctx, line):
    j = i + 1
    n = len(text)
    while j < n:
        if text[j] == '\\':
            j += 2
            continue
        if text[j] == '`':
            return j + 1
        j += 1
    raise Unreadable(f'{ctx.path}:{line}: unterminated backtick — the rest of the file would go unread')


def _skip_dq(text, i, ctx, line):
    """text[i] == '"' → index just past the closing quote (nested $( ) / ${ } / backticks respected)"""
    j = i + 1
    n = len(text)
    while j < n:
        d = text[j]
        if d == '\\':
            j += 2
            continue
        if d == '"':
            return j + 1
        if d == '$' and j + 1 < n and text[j + 1] == '(':
            j = _match_paren(text, j + 1, ctx, line)
            continue
        if d == '$' and j + 1 < n and text[j + 1] == '{':
            j, _ = _match_brace(text, j + 1, ctx, line)
            continue
        if d == '`':
            j = _skip_backtick(text, j, ctx, line)
            continue
        j += 1
    raise Unreadable(f'{ctx.path}:{line}: unterminated double quote — the rest of the file would go unread')


def _match_paren(text, i, ctx, line):
    """text[i] == '(' → index just past its matching ')', quoting-aware (a quoted ')' never terminates)"""
    n = len(text)
    depth = 0
    j = i
    prev = ' '
    while j < n:
        c = text[j]
        if c == '\\':
            j += 2
            prev = c
            continue
        if c == "'":
            j = _skip_sq(text, j, ctx, line)
            prev = "'"
            continue
        if c == '"':
            j = _skip_dq(text, j, ctx, line)
            prev = '"'
            continue
        if c == '`':
            j = _skip_backtick(text, j, ctx, line)
            prev = '`'
            continue
        if c == '#' and prev in ' \t\n(':
            k = text.find('\n', j)
            j = k if k >= 0 else n
            prev = '\n'
            continue
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return j + 1
        prev = c
        j += 1
    raise Unreadable(f'{ctx.path}:{line}: unterminated $( ) / ( ) — the rest of the file would go unread')


def _match_brace(text, i, ctx, line):
    """text[i] == '{' (after '$') → (index just past the matching '}', substitution bodies found inside):
    $( ), backticks and the bodies inside a double-quoted operand are followed; a bare parenthesis is text."""
    n = len(text)
    depth = 0
    j = i
    substs = []
    while j < n:
        c = text[j]
        if c == '\\':
            j += 2
            continue
        if c == "'":
            j = _skip_sq(text, j, ctx, line)
            continue
        if c == '"':
            k = _skip_dq(text, j, ctx, line)
            substs.extend(_substs_in(text[j + 1:k - 1], ctx, line))
            j = k
            continue
        if c == '`':
            k = _skip_backtick(text, j, ctx, line)
            substs.append((text[j + 1:k - 1], line))
            j = k
            continue
        if c == '$' and j + 1 < n and text[j + 1] == '(':
            k = _match_paren(text, j + 1, ctx, line)
            exp = text[j:k]
            if not exp.startswith('$(('):
                substs.append((exp[2:-1], line))
            j = k
            continue
        # a bare "(" / ")" inside ${ } is TEXT (a :? message, a pattern operand) — only "$(" / "`" / "<(" open a body,
        # and every one of those is matched above; nothing executable can hide behind a bare parenthesis here
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return j + 1, substs
        j += 1
    raise Unreadable(f'{ctx.path}:{line}: unterminated ${{ }} — the rest of the file would go unread')


def _substs_in(text, ctx, line, in_dq=True):
    """executable substitution bodies inside a run of text: $( ), backticks, ${ } bodies.
    in_dq=True: the text is the inside of a double-quoted string (an apostrophe is literal there);
    in_dq=False: an unquoted run (an array assignment body) where quotes delimit."""
    out = []
    n = len(text)
    j = 0
    prev = '\n'
    while j < n:
        c = text[j]
        if c == '\\':
            j += 2
            prev = c
            continue
        if c == '#' and not in_dq and prev in ' \t\n(':
            # a comment inside an unquoted run (an array assignment spread over lines): to the end of the line
            k = text.find('\n', j)
            j = k if k >= 0 else n
            prev = '\n'
            continue
        if c == "'" and not in_dq:
            j = _skip_sq(text, j, ctx, line)
            prev = "'"
            continue
        if c == '"' and not in_dq:
            k = _skip_dq(text, j, ctx, line)
            out.extend(_substs_in(text[j + 1:k - 1], ctx, line + text.count('\n', 0, j), True))
            j = k
            continue
        if c == '`':
            k = _skip_backtick(text, j, ctx, line)
            out.append((text[j + 1:k - 1], line + text.count('\n', 0, j)))
            j = k
            continue
        if c == '$' and j + 1 < n and text[j + 1] == '(':
            k = _match_paren(text, j + 1, ctx, line)
            exp = text[j:k]
            if not exp.startswith('$(('):
                out.append((exp[2:-1], line + text.count('\n', 0, j)))
            j = k
            continue
        if c == '$' and j + 1 < n and text[j + 1] == '{':
            k, inner = _match_brace(text, j + 1, ctx, line)
            out.extend(inner)
            j = k
            continue
        prev = c
        j += 1
    return out


def _ansi_c(s):
    out = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c != '\\' or i + 1 >= n:
            out.append(c)
            i += 1
            continue
        d = s[i + 1]
        if d in ANSI:
            out.append(ANSI[d])
            i += 2
        elif d == 'x':
            m = re.match(r'[0-9A-Fa-f]{1,2}', s[i + 2:])
            if m:
                out.append(chr(int(m.group(0), 16)))
                i += 2 + m.end()
            else:
                out.append('\\x')
                i += 2
        elif d in '01234567':
            m = re.match(r'[0-7]{1,3}', s[i + 1:])
            out.append(chr(int(m.group(0), 8)))
            i += 1 + m.end()
        elif d == 'u' or d == 'U':
            m = re.match(r'[0-9A-Fa-f]{1,4}' if d == 'u' else r'[0-9A-Fa-f]{1,8}', s[i + 2:])   # bash: \u ≤ 4 hex digits, \U ≤ 8 (FIX1c: a greedy \u swallowed the next command word)
            if m:
                out.append(chr(int(m.group(0), 16)))
                i += 2 + m.end()
            else:
                out.append('\\' + d)
                i += 2
        else:
            out.append('\\' + d)
            i += 2
    return ''.join(out)


def _skip_dollar(text, i, ctx, line):
    """text[i] == '$' in an UNQUOTED context → (j, kind, payload, substs)
    kind: 'exp' (an unquoted expansion; payload = its text), 'sq' (an ANSI-C literal, decoded), 'dqopen',
    'lit' (a literal '$', a scalar special, or an arithmetic value)."""
    n = len(text)
    if i + 1 >= n:
        return i + 1, 'lit', '$', []
    c = text[i + 1]
    if c == '(':
        if i + 2 < n and text[i + 2] == '(':          # $(( )) — a numeric scalar
            j = _match_paren(text, i + 1, ctx, line)
            return j, 'lit', text[i:j], _substs_in(text[i + 3:j - 2], ctx, line, in_dq=False)
        j = _match_paren(text, i + 1, ctx, line)
        return j, 'exp', text[i:j], [(text[i + 2:j - 1], line)]
    if c == '{':
        j, substs = _match_brace(text, i + 1, ctx, line)
        return j, 'exp', text[i:j], substs
    if c == "'":                      # $'...' ANSI-C quoting: a quoted literal, escapes decoded
        j = i + 2
        while j < n and text[j] != "'":
            j += 2 if text[j] == '\\' else 1
        if j >= n:
            raise Unreadable(f"{ctx.path}:{line}: unterminated $'...' — the rest of the file would go unread")
        return j + 1, 'sq', _ansi_c(text[i + 2:j]), []
    if c == '"':                      # $"..." locale quoting: read as a double quote
        return i + 1, 'dqopen', None, []
    if NAME_CH.match(c) and not c.isdigit():
        j = i + 1
        while j < n and NAME_CH.match(text[j]):
            j += 1
        return j, 'exp', text[i:j], []
    if c in SCALAR_SPECIAL:
        return i + 2, 'lit', text[i:i + 2], []
    if c in SPECIAL:
        return i + 2, 'exp', text[i:i + 2], []
    return i + 1, 'lit', '$', []


# ---------------------------------------------------------------- the lexer

def lex(text, line0, ctx):
    """Split shell text into commands (lists of Words). Returns (commands, heredocs, piped) where heredocs =
    [(command_words, body, body_line0)] and piped = the set of id(command) that are followed by a pipe.
    Raises Unreadable when the text cannot be read to its end."""
    n = len(text)
    i = 0
    line = line0
    commands = []
    cur = []
    w = None
    pending_heredocs = []   # [(delim, strip_tabs, cmd_ref)]
    heredocs = []
    piped = set()
    starts = {}             # id(command) → True when the command is the FIRST on its line (no separator since the newline)
    sep_since_nl = False
    cur_starts_line = None
    at_word_start = True
    next_is_redirect = False

    def end_word():
        nonlocal w, next_is_redirect
        if w is not None:
            if next_is_redirect:
                w.redirect = True
                next_is_redirect = False
            cur.append(w)
            w = None

    def end_command():
        nonlocal cur, cur_starts_line
        end_word()
        if cur:
            commands.append(cur)
            starts[id(cur)] = bool(cur_starts_line)
        cur = []
        cur_starts_line = None

    def want():
        nonlocal w, cur_starts_line
        if w is None:
            w = Word(line)
            w.start = i
            if not cur and cur_starts_line is None:
                cur_starts_line = not sep_since_nl
        return w

    while i < n:
        c = text[i]
        if c == '\n':
            end_command()
            sep_since_nl = False
            line += 1
            i += 1
            at_word_start = True
            if pending_heredocs:
                for delim, strip_tabs, cmd_ref, expands in pending_heredocs:
                    body_lines = []
                    body_line0 = line
                    closed = False
                    while i < n:
                        j = text.find('\n', i)
                        seg = text[i:j] if j >= 0 else text[i:]
                        i = (j + 1) if j >= 0 else n
                        line += 1
                        probe = seg.lstrip('\t') if strip_tabs else seg
                        if probe == delim:
                            closed = True
                            break
                        body_lines.append(seg[1:] if strip_tabs and seg.startswith('\t') else seg)
                    if not closed:
                        raise Unreadable(f'{ctx.path}:{body_line0 - 1}: heredoc <<{delim} never closed — the rest of the file would go unread')
                    heredocs.append((cmd_ref, '\n'.join(body_lines) + '\n', body_line0, expands))
                pending_heredocs = []
            continue
        if c in ' \t':
            end_word()
            i += 1
            at_word_start = True
            continue
        if c == '\\':
            if i + 1 < n and text[i + 1] == '\n':
                i += 2
                line += 1
                continue
            want().add('lit', text[i + 1] if i + 1 < n else '\\')
            i += 2
            at_word_start = False
            continue
        if c == '#' and at_word_start and w is None:
            j = text.find('\n', i)
            i = j if j >= 0 else n
            continue
        at_word_start = False
        if c == "'":
            j = _skip_sq(text, i, ctx, line)
            want().add('sq', text[i + 1:j - 1])
            line += text.count('\n', i, j)
            i = j
            continue
        if c == '"':
            j = _skip_dq(text, i, ctx, line)
            buf = text[i + 1:j - 1]
            ww = want()
            ww.add('dq', buf)
            ww.substs.extend(_substs_in(buf, ctx, line))
            line += buf.count('\n')
            i = j
            continue
        if c == '`':
            j = _skip_backtick(text, i, ctx, line)
            ww = want()
            ww.add('lit', text[i:j])
            ww.unq.append(text[i:j])
            ww.substs.append((text[i + 1:j - 1], line))
            line += text.count('\n', i, j)
            i = j
            continue
        if c == '$':
            j, kind, payload, substs = _skip_dollar(text, i, ctx, line)
            if kind == 'exp':
                ww = want()
                ww.add('lit', payload)
                ww.unq.append(payload)
                ww.substs.extend(substs)
                line += payload.count('\n')
                i = j
                continue
            if kind == 'sq':
                want().add('sq', payload)
                i = j
                continue
            if kind == 'dqopen':
                i = j
                continue
            ww = want()
            ww.add('lit', payload)
            ww.substs.extend(substs)
            line += payload.count('\n')
            i = j
            continue
        if c in ';&|':
            end_word()
            j = i
            while j < n and text[j] in ';&|':
                j += 1
            op = text[i:j]
            was = len(commands)
            end_command()
            sep_since_nl = True
            if op in ('|', '|&') and len(commands) > was:
                piped.add(id(commands[-1]))
            i = j
            at_word_start = True
            continue
        if c == '(' and w is not None and ASSIGN_PREFIX_RE.match(w.text):
            # NAME=( ... ) — an array assignment, one word; its substitutions execute
            j = _match_paren(text, i, ctx, line)
            body = text[i + 1:j - 1]
            w.add('lit', text[i:j])
            w.substs.extend(_substs_in(body, ctx, line, in_dq=False))
            line += text.count('\n', i, j)
            i = j
            continue
        if c == '(' and text.startswith('((', i):
            # arithmetic command (( ... )): one opaque word — never a heredoc opener, never a command boundary inside
            j = _match_paren(text, i, ctx, line)
            end_word()
            ww = want()
            ww.add('lit', text[i:j])
            end_word()
            line += text.count('\n', i, j)
            i = j
            at_word_start = True
            continue
        if c in '()':
            end_word()
            end_command()
            sep_since_nl = True
            i += 1
            at_word_start = True
            continue
        if c in '<>':
            end_word()
            j = i
            while j < n and text[j] in '<>&':
                j += 1
            op = text[i:j]
            if op == '<<' and j < n and text[j] == '-':
                op = '<<-'
                j += 1
            if op in ('<', '>') and j < n and text[j] == '(':
                # process substitution <( ) / >( ): an executable body, not a filename
                k = _match_paren(text, j, ctx, line)
                ww = want()
                ww.add('lit', text[i:k])
                ww.substs.append((text[j + 1:k - 1], line))
                line += text.count('\n', i, k)
                i = k
                continue
            if op.startswith('<<') and not op.startswith('<<<'):
                k = j
                while k < n and text[k] in ' \t':
                    k += 1
                m = re.match(r'''(?:"([^"]*)"|'([^']*)'|\\?([^\s;&|<>]+))''', text[k:])
                if m:
                    delim = m.group(1) if m.group(1) is not None else (m.group(2) if m.group(2) is not None else m.group(3))
                    pending_heredocs.append((delim, op == '<<-', cur, m.group(3) is not None))   # unquoted delimiter → the body expands in the outer shell
                    k += m.end()
                i = k
                continue
            if cur and w is None and cur[-1].text.isdigit() and not cur[-1].redirect:
                cur.pop()
            next_is_redirect = True
            i = j
            continue
        want().add('lit', c)
        i += 1
    if pending_heredocs:
        raise Unreadable(f'{ctx.path}:{line}: heredoc <<{pending_heredocs[0][0]} never closed — the rest of the file would go unread')
    end_command()
    return commands, heredocs, piped, starts


# ---------------------------------------------------------------- classification

def _base(word):
    b = word.bare()
    return os.path.basename(b) if '/' in b else b


def _nonopt(args):
    return [a for a in args if not a.bare().startswith('-')]


def classify(words, funcs, ctx):
    """Return (command_name, arg_words, nested) — nested = [(kind, body_or_wordlist, line)] to analyse recursively.
    Raises Unreadable for constructs the helper refuses by name."""
    ws = [x for x in words if not x.redirect]
    k = 0
    while k < len(ws):
        t = ws[k].bare()
        if ASSIGN_RE.match(t) or t in SKIP_KEYWORDS:
            k += 1
            continue
        break
    if k >= len(ws):
        return None, [], []
    cw = ws[k]
    if cw.first_kind != 'sq' and (cw.text.startswith('$') or cw.text.startswith('"$')) and (cw.unq or cw.first_kind == 'dq'):
        if POSITIONAL_CMD_RE.match(cw.text):
            return None, [], []                     # a positional dispatcher ("$@"): the caller's line is audited instead
        raise Unreadable(f'{ctx.path}:{cw.line}: command held in a variable ({cw.text}) — not audited (the helper fails closed)')
    cmd = _base(cw)
    if cmd in NOT_A_COMMAND:
        return None, [], []
    # FIX2g (the FIX2f lens): an UNKNOWN command word (not a builtin, a stated utility, a wrapper, a shell, the guarded set or a
    # same-file function) that is handed a cleanup / shell word, or its caller's whole argument vector, runs it for all the lexer
    # can tell (`setsid rm -f $L`, `arch -arm64 rm -f $L`, `flock /tmp/l rm -rf $L`, `setsid "$@"`) — refused by name: the subset
    # cannot tell such a command's operand from a command; a known external command with a list stays outside the class
    if cmd not in SHELL_BUILTINS and cmd not in UTILITIES and cmd not in WRAPPERS and cmd not in GUARDED and cmd not in SHELLS \
            and cmd not in funcs and cmd not in FUNCS_BY_PATH.get(ctx.path, ()) and cmd not in SKIP_KEYWORDS and cmd not in ('trap', 'alias', 'ssh', 'su', 'set', 'eval', 'source', 'find'):
        later = ws[k + 1:]
        who = (f'callee {cmd} cannot be resolved to a same-file definition (this file sources another file) and is'
               if getattr(ctx, 'sourced', False) else f'unknown command {cmd}')
        if any(_base(a) in GUARDED or _base(a) in SHELLS for a in later) or any(POSITIONAL_VEC_RE.match(a.text) for a in later):
            raise Unreadable(f'{ctx.path}:{cw.line}: {who} handed a cleanup / shell word or its caller\'s positionals ({" ".join(a.text for a in later)[:60]}) — the subset cannot tell its operand from a command (the helper fails closed)')
        # FIX2h (the FIX2g lens): a variable in the FIRST operand slot of an unknown command (`setsid "$DEL" -f $L`, `setsid $CMD`) is a
        # command held in a variable for all the lexer can tell — the same refusal the command-word position gets
        first_i = next((i for i, a in enumerate(later) if not a.bare().startswith('-')), None)
        if first_i is not None:
            first = later[first_i]
            if first.first_kind != 'sq' and (first.text.startswith('$') or first.text.startswith('"$')) and (first.unq or (first.first_kind == 'dq' and first_i + 1 < len(later))):
                raise Unreadable(f'{ctx.path}:{cw.line}: {who} handed a variable as its first operand ({first.text}) with more words after it, or unquoted — a command held in a variable for all the subset can tell (the helper fails closed)')
    while cmd in WRAPPERS:
        k += 1
        if cmd == 'env':
            while k < len(ws) and (ASSIGN_RE.match(ws[k].bare()) or ws[k].bare().startswith('-')):
                o = ws[k].bare()
                if o == '-S' or o.startswith('--split-string') or (o.startswith('-') and not o.startswith('--') and 'S' in o[1:]):
                    # FIX2j (the FIX2i lens): `env -S "rm -f $L"` re-splits its string into words — a -c body the subset does not read
                    raise Unreadable(f'{ctx.path}:{ws[k].line}: env -S re-splits a string into a command ({ws[k + 1].text if k + 1 < len(ws) else ""}) — outside the supported subset (the helper fails closed)')
                k += 1
                if o in ENV_OPTS_WITH_ARG and k < len(ws):
                    k += 1
        elif cmd == 'xargs':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o in XARGS_OPTS_WITH_ARG and k < len(ws):
                    k += 1
        elif cmd in ('sudo', 'doas'):
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o in SUDO_OPTS_WITH_ARG and k < len(ws):
                    k += 1
        elif cmd == 'timeout':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o in ('-s', '-k') and k < len(ws):
                    k += 1
            k += 1  # the duration
        elif cmd == 'nice':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o == '-n' and k < len(ws):
                    k += 1
        elif cmd == 'exec':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o == '-a' and k < len(ws):
                    k += 1
        elif cmd == 'caffeinate':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o in ('-t', '-w') and k < len(ws):
                    k += 1
        elif cmd == 'stdbuf':
            while k < len(ws) and ws[k].bare().startswith('-'):
                o = ws[k].bare()
                k += 1
                if o in ('-i', '-o', '-e') and k < len(ws):
                    k += 1
        else:  # command / builtin / time / nohup
            while k < len(ws) and ws[k].bare().startswith('-'):
                k += 1
        if k >= len(ws):
            return None, [], []
        cw = ws[k]
        if cw.first_kind != 'sq' and (cw.text.startswith('$') or cw.text.startswith('"$')) and (cw.unq or cw.first_kind == 'dq'):
            if POSITIONAL_CMD_RE.match(cw.text):
                return None, [], []
            raise Unreadable(f'{ctx.path}:{cw.line}: command held in a variable ({cw.text}) behind {cmd} — not audited (the helper fails closed)')
        cmd = _base(cw)
    args = ws[k + 1:]
    nested = []
    if cmd == 'trap':
        body = next((a for a in args if not (a.bare().startswith('-') and len(a.bare()) > 1)), None)
        if body is not None:
            # the subset: a LITERAL trap body only — any expansion in it (bare, or inside double quotes) is resolved at
            # definition time and cannot be read here; refused BEFORE any whitespace test (review r2: `trap "$CMD" EXIT`)
            if body.unq or any(kind == 'dq' and re.search(r'[$`]', s) for kind, s in body.parts):
                raise Unreadable(f'{ctx.path}:{body.line}: trap body is not a literal string ({body.text}) — its expansions are resolved when the trap is set; not audited (the helper fails closed)')
            if re.search(r'\s', body.inner()):
                nested.append(('trap', body.inner(), body.line))
    elif cmd in SHELLS or cmd == 'su':
        idx = 0
        su_login_seen = False
        while idx < len(args):
            o = args[idx].bare()
            if o == '--':
                # option parsing ends here: an operand that still looks like an option (`bash -- -c …`) names a script
                # file called "-c" — outside anything this lexer can certify; refused by name
                if idx + 1 < len(args) and args[idx + 1].bare().startswith('-'):
                    raise Unreadable(f'{ctx.path}:{args[idx + 1].line}: {cmd} -- {args[idx + 1].bare()} — an operand spelled like an option after the end of options is outside the supported subset (the helper fails closed)')
                if cmd == 'su':
                    idx += 1                # FIX2k (the FIX2j lens): `su -- root -c body` — su still hands the words after the login to the shell
                    continue
                break
            if cmd == 'su' and o.startswith('-') and o != '-' and o not in SU_FLAGS and not re.fullmatch(r'-[lmpPfc]+', o):
                # FIX2k: su options with an argument (-s SHELL, -g GROUP, -G, -w, --shell=…, --command …) move the login / body past
                # what the subset reads (`su - root -s sh -c body` was certified) — refused by name
                raise Unreadable(f'{ctx.path}:{args[idx].line}: su option {o} is outside the supported subset (su [-] [-l -m -p -P -f] [login] -c body is the shape read) — not decodable (the helper fails closed)')
            if cmd == 'su' and o == '-':
                idx += 1
                continue
            if not o.startswith('-') and not o.startswith('+'):
                if cmd == 'su' and not su_login_seen:
                    su_login_seen = True    # FIX2j (the FIX2i lens): `su root -c body` — the words after the login go to the login shell
                    idx += 1
                    continue
                break                       # the script / first operand: no -c body
            if o in SHELL_LONG_WITH_ARG:
                idx += 2
                continue
            if o in SHELL_LONG_OPTS or o.startswith('--'):
                idx += 1
                continue
            if DASH_C.match(o) or re.match(r'^\+[a-zA-Z]+$', o):
                if 'c' in o and o.startswith('-'):
                    bidx = idx + 1
                    if bidx < len(args) and args[bidx].bare() == '--':
                        bidx += 1           # `bash -c -- 'body'`: the -- ends the options, the body follows it
                    if bidx >= len(args):
                        raise Unreadable(f'{ctx.path}:{args[idx].line}: {cmd} {o} without a body — not decodable (the helper fails closed)')
                    body = args[bidx]
                    if body.bare() in ('', '--'):
                        # FIX2c: `bash -c -- -- '…'` / `bash -c ''` — a body that is empty or the literal `--` runs no command
                        # string the subset decodes; refused by name rather than certified (the FIX2b Fable lens)
                        raise Unreadable(f'{ctx.path}:{body.line}: {cmd} -c body is {body.text or "empty"} — not a command string the subset decodes (the helper fails closed)')
                    if body.is_pure_expansion():
                        raise Unreadable(f'{ctx.path}:{body.line}: {cmd} -c body built elsewhere ({body.text}) — not audited (the helper fails closed)')
                    nested.append((cmd + ' -c', body.inner(), body.line))
                    break
                idx += 1
                continue
            raise Unreadable(f'{ctx.path}:{args[idx].line}: {cmd} option {o} is outside the supported subset — not decodable (the helper fails closed)')
    elif cmd == 'eval':
        if args:
            if all(a.is_pure_expansion() for a in args):
                raise Unreadable(f'{ctx.path}:{args[0].line}: eval of a body built elsewhere ({" ".join(a.text for a in args)}) — not audited (the helper fails closed)')
            evtext = ' '.join(a.inner() for a in args)
            if DEF_IN_TEXT.search(evtext):
                # FIX2d: `eval 'cleanup(){ rm -f "$@"; }'` defines a function the file's own text never shows — its later call
                # with an unquoted list would resolve to nothing; refused by name (outside the subset's definition rule)
                raise Unreadable(f'{ctx.path}:{args[0].line}: eval defines a function ({evtext[:60]}) — a definition outside the file\'s own text is outside the supported subset (the helper fails closed)')
            nested.append(('eval', evtext, args[0].line))
    elif cmd == 'find':
        idx = 0
        while idx < len(args):
            if args[idx].bare() in ('-exec', '-execdir', '-ok', '-okdir') and idx + 1 < len(args):
                sub = args[idx + 1:]
                stop = next((s for s, a in enumerate(sub) if a.bare() in (';', '+')), len(sub))
                nested.append(('find ' + args[idx].bare(), sub[:stop], args[idx + 1].line))
                idx += 1 + stop
            idx += 1
    elif cmd == 'set':
        if args and args[0].bare() in ('--', '-') and any(a.unq for a in args[1:]):
            raise Unreadable(f'{ctx.path}:{args[0].line}: set {args[0].bare()} over an unquoted expansion ({" ".join(a.text for a in args[1:])}) — the positional parameters become a word-split list; not audited (the helper fails closed)')
    elif cmd == 'alias':
        if any('=' in a.bare() for a in args):
            raise Unreadable(f'{ctx.path}:{cw.line}: alias definition ({" ".join(a.text for a in args)}) — a command held in an alias is not audited (the helper fails closed)')
    elif cmd == 'ssh':
        if len(_nonopt(args)) >= 2:
            raise Unreadable(f'{ctx.path}:{cw.line}: ssh with a command string — a remote shell is not audited (the helper fails closed)')
    # (the FIX1 'words after -- of a same-file function' nesting is gone — FIX2f: a DISPATCHER's call is judged as the command it
    # hands on, in judge_words, with the dispatcher's own `--` convention read from its body; any other function is a consumer,
    # inert, or a row when handed a list)
    return cmd, args, nested


# ---------------------------------------------------------------- judgement

def judge_words(words, path, rows, ctx, frames, funcs, cctx, consumers=frozenset()):
    """rows for one command's words: the for-split rows (frames), the unquoted rows, the call-split rows, then the nested bodies"""
    cmd, args, nested = classify(words, funcs, cctx)
    if cmd is None:
        return
    if cctx.sourced and cmd not in funcs and cmd not in GUARDED and cmd not in SHELLS and cmd not in WRAPPERS \
            and cmd not in SHELL_BUILTINS and cmd not in UTILITIES and cmd not in NOT_A_COMMAND and '/' not in words[0].bare() \
            and any(a.unq for a in args):
        raise Unreadable(f'{cctx.path}:{words[0].line}: callee {cmd} cannot be resolved to a same-file definition (this file sources another file) and is called with an unquoted list — not audited (the helper fails closed)')
    # call-split: the callee consumes "$@" / "$N" on a guarded command (a same-file function, or a -c body) and the call splits a list
    def call_split_rows(call_args, why):
        # the callee consumes its positionals on a guarded command: an unquoted expansion at the call splits there — and so does a
        # QUOTED loop variable born of a for-split (the list was split at the `for`; FIX1c)
        for a in call_args:
            if a.unq:
                rows.append({'file': path, 'line': a.line, 'command': cmd, 'expansions': list(a.unq),
                             'context': (ctx + ' > ' if ctx else '') + f'call-split ({why})', 'word': a.text})
        for var, split, fline, _d in frames:
            pat = re.compile(r'\$\{?' + re.escape(var) + r'(?![A-Za-z0-9_])')
            hit = [a for a in call_args if a.references(pat)]
            if hit:
                rows.append({'file': path, 'line': hit[0].line, 'command': cmd, 'expansions': list(split),
                             'context': (ctx + ' > ' if ctx else '') + f'call-split ({why}) > for-split (for {var} in … at line {fline})', 'word': hit[0].text})
    if cmd in DISPATCHERS_BY_PATH.get(path, {}):
        # FIX2e: `run rm -f $LIST` → the dispatched `rm -f $LIST` is judged here (a row); `run $CMD` → a command held in a
        # variable (refused); `step name pat n -- node x.mjs $T` → judged as node (no row); a dispatcher forwarding "$@" → its caller
        handed = _dispatched(args, DISPATCHERS_BY_PATH[path][cmd], path, cmd)
        if handed:
            judge_words(handed, path, rows, (ctx + ' > ' if ctx else '') + f'dispatch({cmd})', frames, funcs, cctx, consumers)
    if cmd in consumers:
        call_split_rows(args, f'the function {cmd} runs a cleanup over its positional parameters')
    elif cmd in funcs and cmd not in DISPATCHERS_BY_PATH.get(path, {}) and cmd not in INERT_BY_PATH.get(path, ()):
        # FIX2f (the FIX2e lens — four more body shapes the consumer / dispatcher reading missed: a dispatcher behind a wrapper
        # with an operand, a shift-dispatcher called without --, a loop dispatching a cleanup, a heredoc fed to a shell): the subset
        # proves only INERTNESS about a body — a same-file function that is neither a consumer, a dispatcher nor inert, handed a
        # word-split list, is a row whatever its body does
        call_split_rows(args, f'the same-file function {cmd} receives a word-split list and its body is not inert — the subset proves nothing else about a body; quote the call or hold the list in an array')
    if cmd in SHELLS:
        cidx = next((i for i, a in enumerate(args) if DASH_C.match(a.bare()) and 'c' in a.bare()), None)
        if cidx is not None:
            bidx = cidx + 1
            if bidx < len(args) and args[bidx].bare() == '--':
                bidx += 1
            if bidx < len(args) and _consumes_positionals(args[bidx].inner(), cctx, consumers):
                call_split_rows(args[bidx + 1:], f'the {cmd} -c body runs a cleanup over its positional parameters')
            elif bidx < len(args):
                # FIX2f: a -c body is shell code this file carries — handed a word-split list it is a row, whatever the body does
                call_split_rows(args[bidx + 1:], f'the {cmd} -c body receives a word-split list — the subset does not prove a body safe')
    if cmd in GUARDED:
        for var, split, fline, _d in frames:
            pat = re.compile(r'\$\{?' + re.escape(var) + r'(?![A-Za-z0-9_])')
            hit = [a for a in args if a.references(pat)]
            if hit:
                rows.append({'file': path, 'line': hit[0].line, 'command': cmd, 'expansions': list(split),
                             'context': (ctx + ' > ' if ctx else '') + f'for-split (for {var} in … at line {fline})',
                             'word': hit[0].text})
        for a in args:
            if a.unq:
                rows.append({'file': path, 'line': a.line, 'command': cmd, 'expansions': list(a.unq),
                             'context': ctx or 'command', 'word': a.text})
    for kind, body, line in nested:
        sub_ctx = (ctx + ' > ' if ctx else '') + kind
        if isinstance(body, list):
            judge_words(body, path, rows, sub_ctx, frames, funcs, cctx, consumers)
            for wd in body:
                for inner, sline in wd.substs:
                    analyze(inner, path, sline, rows, sub_ctx + ' > cmdsubst', frames=list(frames), funcs=funcs, consumers=consumers)
        else:
            analyze(body, path, line, rows, sub_ctx, frames=list(frames), funcs=funcs, consumers=consumers)


POSITIONAL_REF = re.compile(r'\$\{?[@*1-9]')
DEF_IN_TEXT = re.compile(r'(?:^|[\s;{(|&])(?:function\s+[A-Za-z_][\w-]*|[A-Za-z_][\w-]*\s*\(\s*\))\s*[{(]')


def _function_bodies(text, cctx):
    """name → body text for every `name() {` / `function name {` in the text (brace-matched, quoting-aware)."""
    out = {}
    for m in FUNC_RE.finditer(text):
        name = m.group(1) or m.group(2)
        i = text.find('{', m.start())
        n = len(text)
        depth = 0
        j = i
        while j < n:
            c = text[j]
            if c == '\\':
                j += 2
                continue
            if c == "'":
                j = _skip_sq(text, j, cctx, 0)
                continue
            if c == '"':
                j = _skip_dq(text, j, cctx, 0)
                continue
            if c == '`':
                j = _skip_backtick(text, j, cctx, 0)
                continue
            if c == '#' and j > 0 and text[j - 1] in ' \t\n':
                k = text.find('\n', j)
                j = k if k >= 0 else n
                continue
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    out[name] = text[i + 1:j]
                    break
            j += 1
    return out


# FIX2e (the FIX2d Fable lenses): the subset does NOT decide what "touches the positionals" — the FIX2d enumeration ($1…$9 $@ $*
# ${!1} $# shift, a bare for) missed `${!#}`, `getopts`, a bare `select` and would have missed the next reader too; a same-file
# function that runs a cleanup ANYWHERE is a consumer, full stop (see _consumes_positionals)


def _oneline_loop_body(words, ws, k, path=None):
    """FIX2e (the FIX2d lens): `for NAME do CMD; done` / `select NAME do CMD; done` spelled on one line without `;` before `do`
    is one lexer command — the body words after `do` used to be swallowed with the loop opener and never judged. Returns the
    body words (from the ORIGINAL word list, redirects included) or None when the command is not that form."""
    if k + 2 < len(ws) and ws[k].bare() in ('for', 'select') and ws[k + 2].bare() == 'do':
        body = words[words.index(ws[k + 2]) + 1:]
        lead = [x for x in body if not x.redirect]
        if lead and lead[0].bare() in ('for', 'select', 'while', 'until', 'if', 'case', '{', 'do', 'then'):
            raise Unreadable(f'{path or "<body>"}:{lead[0].line}: a one-line loop body opening a compound ({lead[0].text}…) — outside the supported subset (the helper fails closed)')
        return body
    return None


def _judgeable(words, path=None):
    """the command word lists a lexer command yields for judging: the body of a one-line bare loop, else the command itself"""
    ws = [x for x in words if not x.redirect]
    k = 0
    while k < len(ws) and (ASSIGN_RE.match(ws[k].bare()) or ws[k].bare() in SKIP_KEYWORDS):
        k += 1
    body = _oneline_loop_body(words, ws, k, path) if k < len(ws) else None
    return [body] if body else [words]


def _runs_cleanup(body, cctx, consumers=frozenset(), depth=0):
    """does a body run a guarded command, or call a known consumer, ANYWHERE — with any argument form — incl. inside its
    substitutions, its -c / eval / trap bodies and its find -exec lists? (unreadable = yes: a row, never a silent zero)"""
    if depth > 8:
        return True
    try:
        commands, _h, _p, _s = lex(body, 1, cctx)
    except Unreadable:
        return True
    for words0 in commands:
      for words in _judgeable(words0):
        try:
            cmd, args, nested = classify(words, set(), cctx)
        except Unreadable:
            return True
        if cmd in GUARDED or cmd in consumers:
            return True
        disp = DISPATCHERS_BY_PATH.get(cctx.path, {})
        if cmd in disp and args:
            # FIX2g: `f(){ g rm -f "$1"; }` with g a dispatcher — the dispatched command word is the one that counts
            try:
                handed = _dispatched(args, disp[cmd], cctx.path, cmd)
            except Unreadable:
                return True
            if handed and (_base(handed[0]) in GUARDED or _base(handed[0]) in consumers):
                return True
        for wd in words0:
            for inner, _l in wd.substs:
                if _runs_cleanup(inner, cctx, consumers, depth + 1):
                    return True
        for kind, nb, _l in nested:
            if isinstance(nb, list):
                if nb and (_base(nb[0]) in GUARDED or _base(nb[0]) in consumers):
                    return True
            elif isinstance(nb, str) and _runs_cleanup(nb, cctx, consumers, depth + 1):
                return True
    return False


DISPATCHERS_BY_PATH = {}
FUNCS_BY_PATH = {}


def _is_dispatcher(body, cctx, dispatchers, depth=0):
    """FIX2e: a DISPATCHER executes whatever its caller hands it — its command word is a positional (`run(){ "$@"; }`,
    `"$1" "${@:2}"`, behind a wrapper: `time "$@"`), or it forwards its positionals into a known dispatcher (`wrap(){ run "$@"; }`).
    A dispatcher is not a consumer by itself: its CALL is judged as the command it dispatches (judge_words)."""
    if depth > 8:
        return False
    try:
        commands, _h, _p, _s = lex(body, 1, cctx)
    except Unreadable:
        return False                 # an unreadable body is refused elsewhere (a row / refusal, never a silent pass)
    for words0 in commands:
        for words in _judgeable(words0):
            ws = [x for x in words if not x.redirect]
            k = 0
            while k < len(ws) and (ASSIGN_RE.match(ws[k].bare()) or ws[k].bare() in SKIP_KEYWORDS):
                k += 1
            while k < len(ws) and _base(ws[k]) in WRAPPERS:
                k += 1
                while k < len(ws) and ws[k].bare().startswith('-'):
                    k += 1
            if k >= len(ws):
                continue
            w0 = ws[k]
            if w0.bare().startswith('$') and w0.references(POSITIONAL_REF):
                return True
            if w0.bare() in dispatchers:
                # FIX2g: forwarding = the FIRST dispatched word (after the dispatcher's own `--`, if any) is the positional;
                # a literal command prefixed into a dispatcher (`f(){ run node t.mjs --out "$1"; }`) is not a dispatcher
                rest = ws[k + 1:]
                if rest and rest[0].bare() == '--':
                    rest = rest[1:]
                if rest and rest[0].bare().startswith('$') and rest[0].references(POSITIONAL_REF):
                    return True
    return False


def _strips_dd(body, cctx):
    """the dispatcher's own `--` convention, read from its body — returns (strips, offset, drops). The subset accepts exactly two
    shapes (FIX2i, the FIX2h lens): (a) a body that never shifts and never dispatches `"${@:N}"` — every call is judged from its
    first argument; (b) literal `shift N` commands (the fixed arguments, summed into `offset`) followed by ONE strip test —
    `[ "$1" = -- ] && shift` / `[[ … ]]` / `test` / `if [ "$1" = -- ]; then shift; fi` / `case "$1" in --) shift` — that tests
    `$1` and shifts exactly one word; the call's `--` must sit at `offset`. ANY other shift (a shift after the strip, a
    conditional shift, `shift $n`, a test on `$2`, `shift 2` under a test), or `"${@:N}"` as the command word, makes the
    dispatcher a DROPPER (drops = True): its dispatched command cannot be located from the call, every call is refused by name.
    A `--` that is an argument of printf / echo strips nothing (the FIX2f lens); the lexer splits a case arm on `)`, so the `--)`
    pattern ends one command and its `shift` opens the next."""
    strips = drops = False
    offset = 0
    pre_shift = 0
    strip_shift_pending = False
    try:
        commands, _h, _p, _s = lex(body, 1, cctx)
    except Unreadable:
        return (False, 0, True)
    prev = []
    case_on_1 = False
    for words in commands:
        ws = [x for x in words if not x.redirect]
        bares = [x.bare() for x in ws]
        k = 0
        while k < len(bares) and (ASSIGN_RE.match(bares[k]) or bares[k] in SKIP_KEYWORDS):
            k += 1
        if k >= len(bares):
            prev = bares
            continue
        b0 = bares[k]
        tests_1 = any(re.match(r'^\$\{?1(?![0-9])', x) for x in bares)
        if b0 in ('[', '[[', 'test') and '--' in bares:
            if tests_1 and not strips:
                strips = True
                offset = pre_shift
                strip_shift_pending = True
            else:
                drops = True                                   # a `--` test on another positional, or a second test: not the shape
        elif b0 == 'case' and tests_1:
            case_on_1 = True
        elif b0 == 'shift':
            n = 1
            if k + 1 < len(bares):
                if bares[k + 1].isdigit():
                    n = int(bares[k + 1])
                else:
                    drops = True                               # `shift $n`
                    prev = bares
                    continue
            if case_on_1 and prev and prev[-1] in ('--', '--)') and not strips and n == 1:
                strips = True
                offset = pre_shift                             # the case arm's shift is the strip
                case_on_1 = False
            elif strip_shift_pending and n == 1:
                strip_shift_pending = False                    # the strip's own single shift
            elif strip_shift_pending or strips:
                drops = True                                   # `shift 2` under the test, or any shift AFTER the strip
            else:
                pre_shift += n                                 # fixed arguments shifted away before the test
        elif b0.startswith('$') and ('${@:' in ws[k].text or '${*:' in ws[k].text):
            drops = True
        prev = bares
    if strips and strip_shift_pending:
        drops = True                                           # a test that never shifted
    if not strips and pre_shift:
        drops = True                                           # shifts with no strip test
    return (strips, offset, drops)


def _dispatched(args, shape, path, cmd):
    """the words a dispatcher call hands on: with a strip test, the call's `--` must sit at the dispatcher's slot (after its fixed
    arguments) — then the words after it; a `--` anywhere else belongs to the dispatched command (FIX2h, the FIX2g lens:
    `run rm -f -- x $L` into a `$1` stripper was cut at rm's `--`); a slot without `--` behind fixed arguments, or a dropper
    (shift / `"${@:N}"` without a `--` test), cannot be located → refusal; else all the arguments"""
    strips, offset, drops = shape
    if not args:
        return []                # a bare call (or the definition line itself) hands nothing on
    if drops:
        # FIX2i (the FIX2h lens): a dropper — a shift after its strip, a conditional shift, `shift $n`, a `--` test on `$2`, a
        # `shift 2` under the test, `"${@:N}"` dispatched — moves the dispatched command in a way the subset does not follow
        has_dd = any(a.bare() == '--' for a in args)
        raise Unreadable(f'{path}:{args[0].line}: {cmd} shifts or slices its arguments beyond the one `[ "$1" = -- ] && shift` strip the subset reads{" (the -- on this call is not that strip)" if has_dd else ""} — the dispatched command cannot be located (the helper fails closed)')
    if strips:
        if len(args) > offset and args[offset].bare() == '--':
            return args[offset + 1:]
        if offset > 0:
            raise Unreadable(f'{path}:{args[0].line}: {cmd} shifts {offset} fixed argument(s) and expects -- there; this call has none at that slot — the dispatched command cannot be located (the helper fails closed)')
        return list(args)        # nothing to strip: the dispatched command starts at the first argument
    return list(args)


INERT_BY_PATH = {}
INERT_SKIP = set(SKIP_KEYWORDS) | {'while', 'until', 'esac', 'fi', 'done'}
INERT_HEADERS = ('case', 'for', 'select', 'in', 'function')
NON_INERT = set(GUARDED) | set(SHELLS) | set(WRAPPERS) | {'eval', 'source', '.', 'trap', 'find', 'xargs', 'exec', 'command', 'builtin', 'alias', 'su', 'ssh', 'set', 'enable', 'unset'}


def _is_inert(body, cctx, inert, dispatchers, names, depth=0):
    """FIX2f (the FIX2e lens): the subset proves ONE thing about a function body — INERTNESS: every command a LITERAL word that is
    neither guarded, a shell, a wrapper, eval / source / trap / find / xargs / exec / command / builtin / set nor a dispatcher;
    every same-file callee inert (fixpoint); no heredoc; every substitution inert. An inert body runs nothing that could remove,
    so a call handing it a list is not a row; anything else is a row (whatever the body does — unknown = not inert)."""
    if depth > 8:
        return False
    try:
        commands, heredocs, _p, _s = lex(body, 1, cctx)
    except Unreadable:
        return False
    if heredocs:
        return False
    for words0 in commands:
        try:
            judgeable = _judgeable(words0)
        except Unreadable:
            return False
        for words in judgeable:
            ws = [x for x in words if not x.redirect]
            k = 0
            while k < len(ws) and (ASSIGN_RE.match(ws[k].bare()) or ws[k].bare() in INERT_SKIP or ws[k].bare().endswith(')')):
                k += 1
            if k >= len(ws):
                continue
            w0 = ws[k]
            b = _base(w0)
            if b in INERT_HEADERS:
                continue                                        # `case X in`, `for x in …`: not a command word
            if len(ws) == k + 1 and '$' not in w0.text and '`' not in w0.text and any(ch in w0.text for ch in '*?|'):
                continue                                        # a case PATTERN left alone by the split on `)` (`"node "*`, `*`)
            if b in ('[', '[[', 'test', ':', 'true', 'false', 'local', 'declare', 'typeset', 'readonly', 'export', 'return', 'exit', 'shift', 'break', 'continue', 'read', 'echo', 'printf', 'let', 'wait', 'cd', 'pwd', 'pushd', 'popd', 'umask', 'getopts', 'sleep') or b.startswith('((') or b.startswith('[['):
                pass
            elif w0.unq or '$' in w0.text or '`' in w0.text or w0.text[:1] in ('"', "'"):
                return False                                    # a non-literal command word
            elif b in NON_INERT or b in dispatchers:
                return False
            elif b in names and b not in inert:
                return False
            elif b not in SHELL_BUILTINS and b not in UTILITIES and b not in names:
                # FIX2g: an unknown external command handed a cleanup / shell word or the caller's argument vector is not inert
                # (`setsid rm -f "$1"`, `arch -arm64 "$@"`); one handed plain operands stays outside the class
                if any(_base(a) in GUARDED or _base(a) in SHELLS or _base(a) in NON_INERT for a in ws[k + 1:]) or any(POSITIONAL_VEC_RE.match(a.text) for a in ws[k + 1:]):
                    return False
                later = ws[k + 1:]
                fi = next((i for i, a in enumerate(later) if not a.bare().startswith('-')), None)
                if fi is not None and later[fi].first_kind != 'sq' and (later[fi].text.startswith('$') or later[fi].text.startswith('"$')) and (later[fi].unq or (later[fi].first_kind == 'dq' and fi + 1 < len(later))):
                    return False                            # FIX2h: a variable first operand, unquoted or followed by more words
        for wd in words0:
            for inner, _l in wd.substs:
                if not _is_inert(inner, cctx, inert, dispatchers, names, depth + 1):
                    return False
    return True


def _consumes_positionals(body, cctx, consumers=frozenset(), depth=0):
    """does a body run a guarded command — or call a same-file function already known to be a consumer — with arguments
    that reference the positional parameters ("$@", "$1" …)? (FIX1d: a function that only FORWARDS its positionals to a
    consumer is a consumer too; the caller computes the set to a fixpoint)
    FIX2d / FIX2e: a positional that reaches the cleanup through an ALIAS or a READER (`local a="$1"; rm -f "$a"`, `arr=("$@")`,
    `for x in "$@"`, a bare `for x;` / `select x;`, `x="${1:?}"`, `${!#}`, `getopts`, a nested call handed the alias) is not
    followed word by word, and the subset does not decide what "touches the positionals" (FIX2d's enumeration missed `${!#}`,
    `getopts` and `select` — the FIX2d lenses): a body that runs a guarded command or a consumer ANYWHERE (any argument form,
    at any depth) is a consumer — a row at the call site when called with an unquoted list or a for-split loop variable,
    reviewable, never a silent zero (a function that removes a fixed path is such a row; the header says so)"""
    if depth > 8:
        return True          # a body nested deeper than the lexer follows cannot be proven safe
    if _runs_cleanup(body, cctx, consumers, depth):
        return True
    try:
        commands, _h, _p, _s = lex(body, 1, cctx)
    except Unreadable:
        return True          # an unreadable body cannot be proven safe — treat the call as a consumer (a row, never a silent zero)
    for words0 in commands:
      for words in _judgeable(words0):
        try:
            cmd, args, nested = classify(words, set(), cctx)
        except Unreadable:
            return True
        if (cmd in GUARDED or cmd in consumers) and any(a.references(POSITIONAL_REF) for a in args):
            return True
        if cmd in SHELLS:
            cidx = next((i for i, a in enumerate(args) if DASH_C.match(a.bare()) and 'c' in a.bare()), None)
            if cidx is not None:
                bidx = cidx + 1
                if bidx < len(args) and args[bidx].bare() == '--':
                    bidx += 1
                if bidx < len(args) and _consumes_positionals(args[bidx].inner(), cctx, consumers, depth + 1) \
                        and any(a.references(POSITIONAL_REF) for a in args[bidx + 1:]):
                    return True
        # a cleanup inside a substitution of any word of the command (`result=$(rm -f "$@")`) consumes the positionals too
        for wd in words:
            for inner, _l in wd.substs:
                if _consumes_positionals(inner, cctx, consumers, depth + 1):
                    return True
        for kind, nb, _l in nested:
            if isinstance(nb, list):
                sub = _base(nb[0]) if nb else ''
                if (sub in GUARDED or sub in consumers) and any(a.references(POSITIONAL_REF) for a in nb[1:]):
                    return True
            elif isinstance(nb, str) and _consumes_positionals(nb, cctx, consumers, depth + 1):
                return True
    return False


def analyze(text, path, line0, rows, ctx='', frames=None, funcs=None, consumers=None):
    cctx = Ctx(path)
    if funcs is None:
        funcs = set()
        for m in FUNC_RE.finditer(text):
            funcs.add(m.group(1) or m.group(2))
    if consumers is None:
        bodies = _function_bodies(text, cctx)
        FUNCS_BY_PATH[path] = set(funcs) | set(bodies)
        dispatchers = set()
        while True:      # FIX2e fixpoint: a function forwarding its positionals into a dispatcher is a dispatcher
            grown = {name for name, body in bodies.items() if name not in dispatchers and _is_dispatcher(body, cctx, dispatchers)}
            if not grown:
                break
            dispatchers |= grown
        DISPATCHERS_BY_PATH[path] = {name: _strips_dd(bodies[name], cctx) for name in dispatchers}
        consumers = set()
        while True:      # fixpoint: forwarding functions join once their callee is known (dispatchers known first — FIX2g)
            grown = {name for name, body in bodies.items() if name not in consumers and _consumes_positionals(body, cctx, consumers)}
            if not grown:
                break
            consumers |= grown
        inert = set()
        while True:      # FIX2f fixpoint: a function whose callees are all inert joins once they are known
            grown = {name for name, body in bodies.items() if name not in inert and name not in dispatchers and name not in consumers
                     and _is_inert(body, cctx, inert, dispatchers, set(bodies), 0)}
            if not grown:
                break
            inert |= grown
        INERT_BY_PATH[path] = inert
    frames = list(frames or [])
    commands, heredocs, piped, starts = lex(text, line0, cctx)
    here_by_cmd = {}
    for cmd_words, body, body_line0, expands in heredocs:
        here_by_cmd.setdefault(id(cmd_words), []).append((body, body_line0, expands))
    depth = 0
    brace_depth = 0
    local_masks = []          # FIX2k: one set of locally-declared names per open function body (`local d` masks a surviving frame for d)
    frame_scope = {}          # (var, line) -> (brace level at creation, var local to that body?)
    # the subset's definition rule: `name() {` / `function name` only as the FIRST command of a line; a definition after a
    # separator (`;` `{` `&&` `||` `|` then do else) and a subshell body `name() (` are refused by name (review r2 on #761)
    for words in commands:
        ws0 = [x for x in words if not x.redirect]
        if not ws0:
            continue
        # a definition led by a keyword or an assignment on the same line (`{ f(){ … }; }`, `then f(){ … }`, `do f(){ … }`,
        # `X=1 f(){ … }`) is NOT at line start in the subset's sense: the lexer scans past the leading words to find it
        lead = 0
        while lead < len(ws0) and (ASSIGN_RE.match(ws0[lead].bare()) or ws0[lead].bare() in SKIP_KEYWORDS):
            lead += 1
        if lead >= len(ws0):
            continue
        w0 = ws0[lead]
        after = text[w0.start + len(w0.text):] if w0.start is not None else ''
        is_def = w0.bare() == 'function' or re.match(r'^[ \t]*\(\)\s*[{(]', after) is not None
        if not is_def:
            # FIX2c (the FIX2b Fable lens): a definition-shaped word LATER in the command — `time f(){ … }`, `time -p f(){ … }`,
            # `time function f { … }` (`time` precedes a pipeline and a definition is a valid command there; the definition
            # scan used to step past it silently, neither registering the consumer nor refusing) — is not at line start either
            for j, x in enumerate(ws0[lead + 1:], lead + 1):
                if x.start is None:
                    continue
                tail = text[x.start + len(x.text):]
                later_def = re.match(r'^[ \t]*\(\)\s*[{(]', tail) is not None
                if not later_def and x.bare() == 'function' and j + 1 < len(ws0) and ws0[j + 1].start is not None:
                    later_def = re.match(r'^[ \t]*(\(\))?\s*[{(]', text[ws0[j + 1].start + len(ws0[j + 1].text):]) is not None
                if later_def:
                    raise Unreadable(f'{path}:{x.line}: function definition not at line start ({x.text}…) — outside the supported subset (the helper fails closed)')
            continue
        if lead > 0 or not starts.get(id(words), True):
            raise Unreadable(f'{path}:{w0.line}: function definition not at line start ({w0.text}…) — outside the supported subset (the helper fails closed)')
        if re.match(r'^[ \t]*\(\)\s*\(', after) or (w0.bare() == 'function' and len(ws0) > 1 and ws0[1].start is not None and re.match(r'^[ \t]*(\(\))?\s*\(', text[ws0[1].start + len(ws0[1].text):])):
            raise Unreadable(f'{path}:{w0.line}: function with a subshell body ({w0.text}…) — outside the supported subset (the helper fails closed)')
    cctx.sourced = any(x[0].bare() in ('source', '.') for x in ([y for y in words if not y.redirect] for words in commands) if x)
    for idx, words in enumerate(commands):
        ws = [x for x in words if not x.redirect]
        k = 0
        while k < len(ws) and (ASSIGN_RE.match(ws[k].bare()) or ws[k].bare() in SKIP_KEYWORDS):
            k += 1
        first = ws[k].bare() if k < len(ws) else ''
        # FIX2j/FIX2k: a surviving for-split frame ends only when the variable is bound again by a NEW `for` / `select` over it, or
        # by `read` / mapfile / readarray at the file's top level (also as a `while read -r w` condition) — never inside a function
        # body (a `local w` there is another scope: the FIX2j lens), never by a plain / conditional assignment, `unset`,
        # `printf -v` or `(( ))` (those read as a reviewable row, not a silent zero — the header says so)
        reassigned = set()
        for _ in range(sum(1 for w in ws if w.bare() == '{')):
            local_masks.append(set())                          # `h(){ read w` — the opening brace rides the first body command
        brace_depth = len(local_masks)
        kk = k
        while kk < len(ws) and ws[kk].bare() in ('while', 'until', 'if', 'elif', '!', 'time'):
            kk += 1                                            # `while read -r f` — the read is the loop's condition
        bound = set()
        if kk < len(ws) and ws[kk].bare() in ('read', 'mapfile', 'readarray', 'local', 'declare', 'typeset'):
            bound = {re.match(r'^([A-Za-z_][A-Za-z0-9_]*)', w.bare()).group(1) for w in ws[kk + 1:] if re.match(r'^[A-Za-z_][A-Za-z0-9_]*(=|$)', w.bare())}
        if brace_depth == 0:
            if kk < len(ws) and ws[kk].bare() in ('read', 'mapfile', 'readarray'):
                reassigned |= bound                            # a top-level read binds the name anew
        else:
            local_masks[-1] |= bound                           # inside a body: `local d` / `read d` rebinds d for THIS body only
        loop_var_local = False
        if first in ('for', 'select') and k + 1 < len(ws):
            reassigned.add(ws[k + 1].bare())                   # a new loop over the name supersedes the old frame
            loop_var_local = any(ws[k + 1].bare() in m for m in local_masks)
            if brace_depth:
                local_masks[-1].discard(ws[k + 1].bare())      # the loop's own frame must not be masked inside the loop
        if reassigned:
            frames = [f for f in frames if not (f[3] == 0 and f[0] in reassigned)]
        masked = set().union(*local_masks) if local_masks else set()
        to_judge = words
        if first in ('for', 'select'):
            depth += 1
            if k + 2 < len(ws) and ws[k + 2].bare() == 'in':
                split = [u for wd in ws[k + 3:] for u in wd.unq]
                if split:
                    frames.append((ws[k + 1].bare(), split, ws[k].line, depth))
                    frame_scope[(ws[k + 1].bare(), ws[k].line)] = (len(local_masks), loop_var_local)
                # FIX2j: `for b in "$a"` over a for-split variable — b is born of the same split (a QUOTED loop variable, FIX1c)
                for var, psplit, fline, _d in list(frames):
                    pat = re.compile(r'\$\{?' + re.escape(var) + r'(?![A-Za-z0-9_])')
                    if var != ws[k + 1].bare() and any(wd.references(pat) for wd in ws[k + 3:]):
                        frames.append((ws[k + 1].bare(), psplit, fline, depth))
                        frame_scope[(ws[k + 1].bare(), fline)] = (len(local_masks), loop_var_local)
            # FIX2e: `for x do CMD; done` on one line — the body after `do` is a command of this loop's depth, judged as such
            to_judge = _oneline_loop_body(words, ws, k, path)
        elif first in ('while', 'until'):
            depth += 1
            to_judge = [x for x in words if x is not ws[k]]      # the condition is a command too
        elif first == 'done':
            if depth == 0:
                raise Unreadable(f'{path}:{ws[k].line}: `done` without an open loop — the loop structure is not parsed (the helper fails closed)')
            # FIX2j (the FIX2i lens): bash keeps the loop variable after `done` — its last fragment of the split list reaches a later
            # `rm -f "$w"`; the frame survives the loop (depth 0) until the variable is assigned again
            frames = [f if f[3] < depth else (f[0], f[1], f[2], 0) for f in frames]
            depth -= 1
            to_judge = None
        visible = [f for f in frames if f[0] not in masked] if masked else frames
        if to_judge:
            judge_words(to_judge, path, rows, ctx, visible, funcs, cctx, consumers)
        # executable substitutions anywhere in the command (arguments, assignments, redirect targets, for-lists) run — audit them
        for wd in words:
            for inner, sline in wd.substs:
                analyze(inner, path, sline, rows, (ctx + ' > ' if ctx else '') + 'cmdsubst', frames=list(visible), funcs=funcs, consumers=consumers)
        # heredocs attached to this command
        for body, body_line0, expands in here_by_cmd.get(id(words), []):
            if expands:
                # an unquoted delimiter: every $( ) / backtick / ${ } in the body runs in the OUTER shell before the target sees a byte
                for inner, sline in _substs_in(body, cctx, body_line0, in_dq=True):
                    analyze(inner, path, sline, rows, (ctx + ' > ' if ctx else '') + 'heredoc-expansion', frames=list(visible), funcs=funcs, consumers=consumers)
            cmd, args, _n = classify(words, funcs, cctx) if words else (None, [], [])
            targets = [x.bare() for x in words if x.redirect]
            shell_fed = cmd in SHELLS and not _nonopt(args)
            if cmd == 'tee':
                targets += [a.bare() for a in _nonopt(args)]
            if not shell_fed and id(words) in piped and idx + 1 < len(commands):
                ncmd, nargs, _n2 = classify(commands[idx + 1], funcs, cctx)
                shell_fed = ncmd in SHELLS and not _nonopt(nargs)
            if shell_fed or any(t.endswith(EXTS) for t in targets):
                analyze(body, path, body_line0, rows, (ctx + ' > ' if ctx else '') + 'heredoc', frames=list(visible), funcs=funcs, consumers=consumers)
        for _ in range(sum(1 for w in ws if w.bare() == '}')):
            if local_masks:
                lv = len(local_masks)
                closing = local_masks.pop()
                # a loop inside the body over a name local to it ends with the body; a loop over a global name survives (bash)
                frames = [f for f in frames if not (frame_scope.get((f[0], f[2]), (0, False)) == (lv, True) or (frame_scope.get((f[0], f[2]), (0, False))[0] == lv and f[0] in closing))]
        brace_depth = len(local_masks)
    if depth != 0:
        raise Unreadable(f'{path}:{line0}: {depth} loop(s) opened in this body never closed — the loop structure is not parsed (the helper fails closed)')


# ---------------------------------------------------------------- driver

def refuse(msg):
    print(f'[audit-unquoted-cleanup] REFUSED — {msg}', file=sys.stderr)
    sys.exit(2)


def collect(paths, root):
    files = []
    for p in paths:
        full = os.path.abspath(p)                       # relative paths resolve from the CURRENT directory
        rf, rr = os.path.realpath(full), os.path.realpath(root)
        if not (rf == rr or rf.startswith(rr.rstrip(os.sep) + os.sep)):   # --root / contains every absolute path
            refuse(f'{p} resolves to {full}, outside --root {root} — a zero over another tree would be vacuous')
        if os.path.isdir(full):
            for dp, dn, fn in os.walk(full):
                dn.sort()
                for f in sorted(fn):
                    if f.endswith(EXTS):
                        files.append(os.path.join(dp, f))
        elif os.path.isfile(full):
            files.append(full)
        else:
            refuse(f'{p}: not a file or directory')
    return files


def main():
    ap = argparse.ArgumentParser(description='ADVISORY (not a gate): lists rm|rmdir|mv|cp|kill with an unquoted expansion in their arguments and the constructs it refuses to read; exits 0 except on a usage error — the known blind spots are in the module header')
    ap.add_argument('paths', nargs='*', help='files or directories (default: <root>/tools/render); relative paths resolve from the cwd and must lie under --root')
    ap.add_argument('--root', default=None, help='the tree under audit (default: the tree this helper file sits in); printed on the verdict line')
    ap.add_argument('--all-repo', action='store_true', help='every tracked *.sh / *.bash / *.zsh (git ls-files) — disclosure sweep')
    ap.add_argument('--json', default=None, help='write the rows as JSON to this file')
    a = ap.parse_args()
    root = os.path.abspath(a.root) if a.root else os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
    if a.all_repo:
        try:
            out = subprocess.run(['git', '-C', root, 'ls-files', '-z'], check=True, capture_output=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            refuse(f'git ls-files failed under {root} (a checkout is required, an export has no .git): {e}')
        files = [os.path.join(root, f.decode()) for f in out.split(b'\0') if f and f.decode().endswith(EXTS)]
        files += collect(a.paths, root)
    else:
        files = collect(a.paths, root) if a.paths else collect([os.path.join(root, 'tools', 'render')], root)
    files = sorted(dict.fromkeys(files))
    if not files:
        refuse(f'no shell script to audit under {root} ({", ".join(a.paths) if a.paths else "tools/render"}) — an empty set never reads as clean')
    rows = []
    refused = []
    for f in files:
        try:
            with open(f, encoding='utf-8', errors='replace') as fh:
                text = fh.read()
        except OSError as e:
            refuse(f'{f}: {e}')
        rel = os.path.relpath(os.path.realpath(f), os.path.realpath(root))
        try:
            analyze(text, rel, 1, rows)
        except Unreadable as e:
            refused.append(str(e))
        except RecursionError:
            refused.append(f'{rel}: nesting deeper than the lexer follows — not parsed (the helper fails closed)')
    seen = set()
    uniq = []
    for r in sorted(rows, key=lambda r: (r['file'], r['line'], r['command'], r['word'])):
        key = (r['file'], r['line'], r['command'], r['word'])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    rows = uniq
    for r in rows:
        print(f"{r['file']}:{r['line']}: {r['command']} — unquoted {' '.join(r['expansions'])} in {r['word']} [{r['context']}]")
    if a.json:
        try:
            with open(a.json, 'w') as fh:
                json.dump({'root': root, 'rows': rows, 'files': [os.path.relpath(f, root) for f in files]}, fh, indent=1)
        except OSError as e:
            refuse(f'--json {a.json}: {e}')
    for msg in refused:
        print(f'[audit-unquoted-cleanup] REFUSED — {msg}', file=sys.stderr)
    if refused:
        # a refused file is never counted as clean: no zero-row verdict line (the sweep still names every file it refused);
        # COMPANION-1d: ADVISORY — the exit is 0 (a refusal is information, not a gate)
        print(f'[audit-unquoted-cleanup] REFUSED — {len(refused)} of {len(files)} files not parsed with proven semantics under {root} ({len(rows)} rows in the files that were read)', file=sys.stderr)
        sys.stdout.flush(); sys.stderr.flush()   # the ADVISORY line trails in combined captures (the demotion lens)
        print('[audit-unquoted-cleanup] ADVISORY — not a gate: exit 0; the known blind spots are listed in the module header', file=sys.stderr)
        sys.exit(0)
    print(f'[audit-unquoted-cleanup] {len(rows)} rows over {len(files)} files under {root}')
    sys.stdout.flush(); sys.stderr.flush()   # the ADVISORY line trails in combined captures (the demotion lens)
    print('[audit-unquoted-cleanup] ADVISORY — not a gate: exit 0 whatever the rows; the known blind spots are listed in the module header', file=sys.stderr)
    sys.exit(0)


if __name__ == '__main__':
    main()
