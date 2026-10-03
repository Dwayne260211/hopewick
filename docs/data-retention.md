# Data retention

This is the adopted policy. It describes what Hopewick already does.

## Chats

A chat is kept on the live disk until the person deletes that chat, deletes the account, or its `updated` time is 24 months or older. It is then removed from the live server. Free and Plus use the same rule.

24 months is 730 days of 24 hours (`CHAT_RETENTION_MS` in `server/chats.js`). The clock is the conversation `updated` field, in epoch milliseconds. A missing `updated` is treated as expired. The check runs when that account’s chats are read and when they are merged or saved. There is no separate nightly job.

A free account can open the latest chat. Older chats can still be stored. Not seeing them is not deletion. Hopewick Plus can open stored history that is still there.

This does not delete the copy in the browser. The server does not clear localStorage. Snapshots are not wiped by this rule, and this policy does not say how long a snapshot is kept.

Deleting one chat removes that chat from the account save. Deleting the account removes the sign-in, that account’s server chats, check-ins, and weekly goals, and signs the person out, immediately. It does not wait 24 months. A copy in the browser can remain until the person clears it in Settings. Stripe can keep invoices. Existing Render disk snapshots can still hold older data. Account deletion does not wipe a disk snapshot, and this does not promise they disappear at once. On 3 October 2026 the newest snapshot was restored onto the live disk. Files were not compared one by one. The steps for a person who cannot delete the account in the app are in [complaints-and-deletion.md](complaints-and-deletion.md). An email request is manual. It is not processed automatically.

## Sign-in session

The session cookie is a 30-day inactivity limit. Using Hopewick slides it forward (`GET /api/auth/me` while the app is in use). It expires after 30 days unused. Signing out ends it immediately. The cookie stays httpOnly, SameSite=Lax, and Secure on HTTPS. One session per account.

Changing an existing password replaces that session, so the previous cookie stops working. Setting a password for the first time keeps the current session.

Delete account, cancel Plus, the billing portal, and card setup ask again before they run. If the account has a password, the current password is required. If it does not, a magic-link verify or Google sign-in from the last 10 minutes is required. Ordinary chat does not ask again. This is not a second factor. The magic link is still single-use and still expires in 30 minutes.
