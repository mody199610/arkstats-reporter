#!/bin/bash

# setup colors
red=`tput setaf 1`
green=`tput setaf 2`
cyan=`tput setaf 6`
bold=`tput bold`
reset=`tput sgr0`

heading()
{
	echo
	echo "${cyan}==>${reset}${bold} $1${reset}"
}

success()
{
	echo
	echo "${green}==>${bold} $1${reset}"
}

error()
{
	echo
	echo "${red}==>${bold} Error: $1${reset}"
}

heading "Installing arkstats-reporter-1.0.0..."

heading "Updating system. Enter your sudo password if prompted..."
echo
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y software-properties-common
success "System is up to date."
sleep 1

heading "Installing dependencies..."
echo
sudo apt-get install -y software-properties-common build-essential git unzip wget nodejs npm ntp cloud-utils
success "Dependencies installed."
sleep 1

heading "Setting up path..."
echo
[[ ! -f /usr/bin/node ]] && sudo ln -s /usr/bin/nodejs /usr/bin/node
success "Path set."
sleep 1

heading "Installing npm & pm2..."
echo
sudo npm install
sudo npm install pm2 -g
success "Installed OK."

heading "Adding ntp time update to cronjob..."
echo
sudo bash -c "cat > /etc/cron.hourly/ntpdate << EOF
#!/bin/sh
pm2 flush
sudo service ntp stop
sudo ntpdate -s ntp.ubuntu.com
sudo service ntp start
EOF"

sudo chmod 755 /etc/cron.hourly/ntpdate
success "System time synchronised and updates scheduled."
echo
sleep 1

heading "Pulling latest configuration file..."
echo
wget https://raw.githubusercontent.com/dafty-1/arkstats-reporter/master/app.json -O app.json

sleep 3
clear

# Config

heading "Enter the IP address of your Ark Node installation, without quotes, followed by ENTER."
echo "This is usually ${bold}localhost${reset}"
    read -e -r -p ": " RPC_HOST
    sed -i "/.*RPC_HOST.*/c\ \ \ \ \ \ \"RPC_HOST\"\ \ \ \ \ \ \ \ :\ \"$RPC_HOST\"," app.json

heading "Enter the port of your Ark Node installation, without quotes, followed by ENTER."
echo "This is usually ${bold}4001${reset}"

    read -e -r -p ": " RPC_PORT
    sed -i "/.*RPC_PORT.*/c\ \ \ \ \ \ \"RPC_PORT\"\ \ \ \ \ \ \ \ :\ $RPC_PORT," app.json
    sed -i "/.*LISTENING_PORT.*/c\ \ \ \ \ \ \"LISTENING_PORT\"\ \ :\ $RPC_PORT," app.json

heading "Enter a username to identify your node, without quotes, followed by ENTER."
echo "This can be a delegate name, Ark address or Slack username"

    read -e -r -p ": " INSTANCE_NAME
    sed -i "/.*INSTANCE_NAME.*/c\ \ \ \ \ \ \"INSTANCE_NAME\"\ \ \ :\ \"$INSTANCE_NAME\"," app.json

heading "Enter an email address or website for your node, without quotes, followed by ENTER."
echo "This is not required but can be helpful for other users"

    read -e -r -p ": " CONTACT_DETAILS
    sed -i "/.*CONTACT_DETAILS.*/c\ \ \ \ \ \ \"CONTACT_DETAILS\"\ :\ \"$CONTACT_DETAILS\"," app.json

heading "Enter the secret token used to authenticate with the server, without quotes, followed by ENTER."
echo "Start a direct message with dafty on the ArkEcosystem Slack to get the secret token"

    read -e -r -p ": " WS_SECRET
    sed -i "/.*WS_SECRET.*/c\ \ \ \ \ \ \ \"WS_SECRET\"\ \ \ \ \ \ :\ \"$WS_SECRET\"," app.json

success "Configuration complete!"
sleep 1

heading "If you have made a mistake with any of the details above, run this script again."
echo
echo
echo
heading "${cyan} Please start ArkStats reporter by typing ${bold}pm2 start app.json${reset}"
heading "${cyan}Check the status of ArkStats by typing ${bold}pm2 log${reset}"
echo
echo
echo
heading "This script will now exit..."

sleep 3
