#!/bin/bash

sudo apt-get install git pkg-config autoconf automake libtool libx264-dev -y
git clone https://github.com/mstorsjo/fdk-aac.git
cd fdk-aac
./autogen.sh
./configure --prefix=/usr/local --enable-shared --enable-static
make -j4
sudo make install
sudo ldconfig
cd ..
git clone https://github.com/FFmpeg/FFmpeg.git
cd FFmpeg
./configure --prefix=/usr/local --arch=armel --target-os=linux --enable-omx-rpi --enable-nonfree --enable-gpl --enable-libfdk-aac --enable-mmal --enable-libx264 --enable-decoder=h264 --enable-network --enable-protocol=tcp --enable-demuxer=rtsp
make -j4
sudo make install
