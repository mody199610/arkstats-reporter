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
	echo "${red}==>${bold} $1${reset}"
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
sudo apt-get install -y software-properties-common build-essential git unzip wget ntp cloud-utils
success "Dependencies installed."
sleep 1

heading "Installing npm & pm2..."
echo
npm install
npm install pm2 -g
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
clear

if [ ! -f app.json ]; then
    heading "Pulling latest configuration file..."
    wget https://raw.githubusercontent.com/dafty-1/arkstats-reporter/master/app-default.json -O app.json
fi

if ! grep -q "\"RPC_HOST\"        : \"\"," app.json; then
    error "ArkStats has already been configured (username, secret key, etc). Would you like to reconfigure it? [y/N]."
    echo "If you are updating ArkStats, this is usually not required."
    read -e -r -p ": " RECONFIGURE
    if [[ $RECONFIGURE == "y" || $RECONFIGURE == "Y" || $RECONFIGURE == "yes" || $RECONFIGURE == "YES" || $RECONFIGURE == "Yes" ]]
    then
        heading "Pulling latest configuration file..."
        echo
        wget https://raw.githubusercontent.com/dafty-1/arkstats-reporter/master/app-default.json -O app.json
    fi
fi

if grep -q "\"RPC_HOST\"        : \"\"," app.json; then

    #Config
 
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
fi

success "Configuration complete! Starting ArkStats..."
sleep 3


NODE_VER=`node -v`

# unstartup pre 1.1.4
sudo env PATH=$PATH:/home/ark/.nvm/versions/node/$NODE_VER/bin /usr/local/lib/node_modules/pm2/bin/pm2 unstartup systemd -u $USER --hp /home/$USER

# unstartup post 1.1.4
sudo env PATH=$PATH:/home/$USER/.nvm/versions/node/$NODE_VER/bin /home/$USER/.nvm/versions/node/$NODE_VER/lib/node_modules/pm2/bin/pm2 unstartup systemd -u $USER --hp /home/$USER

# belt and braces for pre 1.1.4
pm2 stop all &> /dev/null
sudo chown -R $USER:$USER /home/$USER/.pm2

pm2 stop all
pm2 delete all
pm2 flush
sleep 3
clear

pm2 start app.json
sleep 3
clear

success "Installing ArkStats on boot..."
sleep 3

sudo env PATH=$PATH:/home/$USER/.nvm/versions/node/$NODE_VER/bin /home/$USER/.nvm/versions/node/$NODE_VER/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER
pm2 save

sleep 5
clear

pm2 status
echo
echo
echo
success "Installation successful!"
success "If you have made a mistake with any of the details, run this script again."
echo
echo "${cyan}${bold}ArkStats is running and will be restarted automatically on boot.${reset}"
echo "${cyan}Check the status by typing ${bold}pm2 status${reset}${cyan} or view the logs by typing ${bold}pm2 log${reset}."
echo
heading "For bugs, questions or comments, please message dafty on Slack!"
echo "This script will now exit..."

sleep 3
