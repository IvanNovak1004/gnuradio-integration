#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Remove blocks module """

# Disallow running this script as a module
if __name__ != '__main__':
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolRemove, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser('gr_modtool rm')
argparser.add_argument('blockname', type=str)
args = argparser.parse_args()

try:
    tool = ModToolRemove(args.blockname,
                         yes=True)
    if not tool.info['pattern'] or tool.info['pattern'].isspace():
        tool.info['pattern'] = '.'
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
