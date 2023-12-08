#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Disable blocks module """

# Disallow running this script as a module
if __name__ != '__main__':
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolDisable, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser('gr_modtool disable')
argparser.add_argument('blockname', type=str)
args = argparser.parse_args()

try:
    tool = ModToolDisable(args.blockname)
    if not tool.info['pattern'] or tool.info['pattern'].isspace():
        tool.info['pattern'] = '.'
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
