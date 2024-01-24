#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Returns information about a module """

# Disallow running this script as a module
if __name__ != "__main__":
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolInfo, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser("gr_modtool info")
argparser.add_argument("--python-readable", action="store_true")
args = argparser.parse_args()

try:
    tool = ModToolInfo(python_readable=args.python_readable)
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
