#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Create Python bindings for GR block """

# Disallow running this script as a module
if __name__ != "__main__":
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolGenBindings, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser("gr_modtool bind")
argparser.add_argument("blockname", type=str, default=None)
argparser.add_argument(
    "--addl_includes",
    type=str,
    default=None,
    help="Comma separated list of additional include directories (default None)",
)
argparser.add_argument(
    "-D",
    "--define_symbols",
    type=str,
    action="extend",
    nargs="*",
    help="Set precompiler defines",
)
argparser.add_argument("-u", "--update-hash-only", action="store_true")
args = argparser.parse_args()

try:
    tool = ModToolGenBindings(
        args.blockname,
        addl_includes=args.addl_includes,
        define_symbols=args.define_symbols,
        update_hash_only=args.update_hash_only,
    )
    if not tool.info["pattern"] or tool.info["pattern"].isspace():
        tool.info["pattern"] = "."
    tool.validate()
    tool.info["blockname"] = None
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
