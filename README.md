# reddit-saved-downloader
A simple script I made to download my saved reddit posts, has support for multiple accounts. Current only downloads images, all other media posts and all non-media posts  are ignored. This also doubles as a backup for all saved posts, since Reddit doesn't show saved posts over 1000 entries.

To use this, simply `git clone` this repo, `npm i` in the created directory and finally use `node index` to start.

The script authenticates with Reddit using `script` authentication, so to use this you must add a new app to your account. It can be done using the following steps:
1) Go to https://old.reddit.com/prefs/apps/ (Login to Reddit account if required)
2) Click Create new app
3) Select the `script` app type, other fields can be filled as per your liking.
4) Click Create app
5) Note down the `clientId` (the random string of characters below `personal use script`) and the `clientSecret`.
6) Start the app with `node index` and put `clientID` and `clientSecret` when asked.
