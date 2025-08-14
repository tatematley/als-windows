#!/usr/bin/env bash
# Place in .platform/hooks/postdeploy directory
sudo certbot -n -d http://glassguys.us-east-1.elasticbeanstalk.com/ --nginx --agree-tos --email itstheglassguys@gmail.com