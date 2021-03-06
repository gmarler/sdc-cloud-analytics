#!/bin/bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2014, Joyent, Inc.
#

set -e
set -o xtrace

DIRNAME=$(cd `dirname $0`; pwd)
git submodule update --init
gmake pkg
gmake release

NAME=cloud_analytics
BRANCH=$(git symbolic-ref HEAD | cut -d'/' -f3)
DESCRIBE=$(git describe)
BUILDSTAMP=`TZ=UTC date "+%Y%m%dT%H%M%SZ"`; export BUILDSTAMP
PKG_SUFFIX=${BRANCH}-${BUILDSTAMP}-${DESCRIBE}.tgz
CABASE_PKG=cabase-${PKG_SUFFIX}
CAINSTSVC_PKG=cainstsvc-${PKG_SUFFIX}
CA_PKG=ca-pkg-${BRANCH}-${DESCRIBE}*.tar.bz2 

if [[ $( echo $BRANCH | grep release) && -z $PUBLISH_LOCATION ]]; then
    releasedate=$(echo $BRANCH | cut -d '-' -f2)
    RELEASEDIR=${releasedate:0:4}-${releasedate:4:2}-${releasedate:6:2}
    ASSETS_LOCATION=/rpool/data/coal/releases/${RELEASEDIR}/deps/assets
    PUBLISH_LOCATION=${ASSETS_LOCATION}/agents/${NAME}/${BRANCH}/
fi

if [[ -z $PUBLISH_LOCATION ]]; then
  PUBLISH_LOCATION=/rpool/data/coal/live_147/agents/${NAME}/${BRANCH}/
fi
if [[ -z $ASSETS_LOCATION ]]; then
  ASSETS_LOCATION=/rpool/data/coal/live_147/assets
fi
source $DIRNAME/publish.sh
