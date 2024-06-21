---
'homebridge-ring': major
'ring-client-api': major
---

Updated to new push notification interface. This will change the shape of push notifications for projects which manually consume push notifications, but should not impact homebridge-ring users. If your push notifications for cameras (motion events, dings, etc) do not work after updating, please reboot and try again, then see https://github.com/dgreif/ring/wiki/Notification-Troubleshooting if issues continue.
