#!/bin/sh

BR=/home/br
IK=$BR/ikeys
NETWORK=10.0.0.0
NETMASK=255.255.255.0

# ---
runuser -l br -c "mkdir -p $IK"

# ---
function write_ip  {
    DIR=$IK
    runuser -l br -c "mkdir -p $DIR"
    echo -n "$IP" > "/tmp/br/avi.$DEVICE"
    runuser -l br -c "cp /tmp/br/avi.$DEVICE $DIR/$DEVICE"
    cat << EOT >> "$BR/ikeys.txt"
$DEVICE: $IP
EOT
}

MAC_ADDR=$(ifconfig eth0 | sed -n 's/.*HWaddr \([a-fA-F0-9:]*\).*/\L\1/p')
echo "mac: [$MAC_ADDR]";
IP=$(ifconfig eth0 | sed -n 's/.*inet addr:\([0-9.]*\)*.*/\1/p')
DEVICE=eth0
write_ip
echo "eth0 ip: [$IP]";
LIP=($(curl -s http://169.254.169.254/latest/meta-data/network/interfaces/macs/$MAC_ADDR/local-ipv4s))
i=1
for IP in ${LIP[@]:1}; do
    echo "Adding IP: [$IP]"
#    ip addr add dev eth0 $IP/24
    DEVICE=eth0:$i
    FILE=/etc/sysconfig/network-scripts/ifcfg-$DEVICE
    cat << EOT > $FILE
# AUTOMATICALLY GENERATED (BR / netops / clouds)
DEVICE=$DEVICE
IPADDR=$IP
NETMASK=$NETMASK
NETWORK=$NETWORK
ONBOOT=yes
BOOTPROTO=none
EOT
    ifup $DEVICE
    i=$[i+1]
    write_ip
done

