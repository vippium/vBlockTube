![vBlockTube](https://socialify.git.ci/vippium/vBlockTube/image?custom_language=GreasyFork&font=Jost&language=1&name=1&owner=1&pattern=Transparent&theme=Auto)

<p align="center">
  <a href='https://update.greasyfork.org/scripts/557720/vBlockTube.user.js' target="_blank"><img alt='Greasyfork' src='https://img.shields.io/badge/Install_from greasyfork-100000?style=for-the-badge&logo=Greasyfork&logoColor=98D6D5&labelColor=154A56&color=98D6D5'/>
  </a>
</p>


## Overview

**vBlockTube** is a powerful userscript designed to block YouTube ads across all platforms, including YouTube Music, YouTube Kids, and YouTube Shorts. It ensures a smooth, uninterrupted viewing experience by removing all ads without causing any annoying white space or flashing. The script is continuously updated to provide the best ad-blocking experience available.

### Key Features
- **Seamless Ad Blocking**: Removes all ads, including video ads, sponsored content, and membership trials.
- **Customizable Display**: You can enable or disable content sections such as short video recommendations, movie recommendations, and game hub suggestions.
- **Enhanced Playback**: Offers features like video/audio downloads, automatic scrolling of Shorts, and other useful functionalities.
- **Cross-platform Support**: Works on both desktop and mobile versions of YouTube, including YouTube Music and YouTube Kids.

## Important Notice

**Do NOT use any other ad-blocking extensions or scripts** in combination with this userscript. Running multiple ad-blockers can result in your account being blacklisted by YouTube, causing playback issues. If this happens, follow the instructions below to resolve the issue.

- Disable the `disableRemovePlayerAd` variable in the script to prevent blocking ads on video start (you can find this option around line 55).
- If you encounter issues, you can switch your IP address or log out of your account to restore normal playback.

---

## Script Functionality

### Ad Blocking

- **General YouTube (Desktop & Mobile)**: Removes all types of ads, including the first ad at the beginning of the video, pop-ups, and YouTube Premium trials.
- **YouTube Music**: Blocks all advertisements during music playback and removes membership pop-ups.
- **YouTube Kids**: Blocks ads in videos and removes short videos.
- **YouTube Shorts**: Removes all ads and pop-ups in the Shorts section.

### Customizable Features

- **Content Recommendations**: You can toggle the display of various content sections such as trending videos, movie recommendations, game hub, etc.
- **Video Playback**: Removes all ads during video playback and cleans up recommended video lists.
- **Short Videos**: Automatically scroll through short videos and disable looping of Shorts.
- **Sponsorblock**: Skip unwanted sections or video parts with it.
- **Action bar buttons visibility**: Keep only required buttons on watch page, removing the clutter.
  
---

## Script Options

There are three primary options that you can control through YouTube's search bar:

- **2333**: Opens a dialog box with various script options.
- **2444**: Displays information about the current script settings.
- **2555**: Resets all script configurations to default.
- **2666**: Toggle visibility of Watch Page elements.

---

## Known Issues & Solutions

### Common Issues

1. **Script Conflict**: If the script isn't working properly, it may conflict with other scripts or browser extensions (especially ad blockers).
2. **Script Failed to Load**: The script may fail to load if there's an issue with the installation.

### Solutions

- **Troubleshooting Conflicts**: Disable all other YouTube-related scripts or browser extensions one by one to identify the cause of the issue.
- **Refreshing**: If the script doesn't load, try refreshing the page or restarting the browser.

---

## Specific Plugin Conflict Handling

Some ad-blocking plugins may interfere with this script. To resolve any issues:

1. Open the plugin's settings and **uncheck "Allow ads on specific YouTube channels"** (found in your browser’s adblock settings).
2. Disable any other ad-blocking extensions that may be running simultaneously.

---

## How to Install

1. Install a userscript manager like **Tampermonkey** or **Greasemonkey**.
2. Download this script from [GreasyFork](https://github.com/vippium/vBlockTube/raw/refs/heads/main/Fuck%20YouTube%20Ads%20wo%20Lubricant.user.js) and add it to your userscript manager.
3. Refresh your YouTube tab, and you should start seeing ads blocked!

---

## Contributing

Feel free to open issues or pull requests if you encounter bugs or want to contribute improvements. We welcome any contributions to improve the script!

---

## License

This project is licensed under the Copyright License - see the [LICENSE](LICENSE) file for details.

