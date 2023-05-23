---
'ring-client-api': patch
---

Update push notifications to include a full and accurate ding `id`. Note, this is technically a breaking change because the `id` was previously a `number` instead of a `string`, but the last few digits were truncated due to number rounding. We are releasing this as a patch because the `number` version was unusable for fetching additional information about the ding.
