#!/bin/sh

echo ---
echo 'Bare instance - phase 3 (now as br)'
echo ---

cd $HOME
cat << 'EOT' >>.bash_profile

# --- added by BR clouds/setup
export HISTSIZE=20000
export PATH=~/gits/clouds/utils:$PATH
EOT
cat << 'EOT' >.exrc
set tabstop=4
set et
autocmd FileType * setlocal formatoptions-=c formatoptions-=r formatoptions-=o
EOT

echo "Get BR sources .."
mkdir gits
cd gits
git clone git://github.com/babelroom/clouds.git
cd ./clouds/clouds

# get basics right
./setup_base.sh || exit -1

# setup init-instance, start-instance
sudo install -o root -m 755 ./init-instance /etc/init.d
sudo /sbin/chkconfig --add init-instance
sudo service init-instance start

sudo install -o root -m 755 ./start-instance /etc/init.d
sudo /sbin/chkconfig --add start-instance

# copy initial files
cd misc
sudo install -o root -m 644 issue.std /etc/issue
cp config.default ~/config

cat << EOT 
---
Done!, now it's up to you.
Suggested:

[br@host]$ setup_all.sh

   *** READY FOR SETUPS ***

EOT
#bash
#su - br # run profile etc.

