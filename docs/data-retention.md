# Data retention

This is the adopted policy. It describes what Hopewick already does. It does not delete data, and it is not a deletion job.

## Chats

Saved chats stay until the person deletes that chat, or deletes the account.

A free account can open the latest chat. Older chats stay stored. Hopewick Plus can open those older chats. Free does not remove them.

There is no automatic expiry. Nothing in the app deletes a chat because of its age.

A future maximum, for example 24 months, is **not in place**. Do not add a job that deletes chats by age unless a later decision says to.

Deleting one chat removes that chat from the account save. Deleting the account removes that account’s server chats, and that account’s server check-ins and weekly goals. A copy can remain in the browser until the person clears it in Settings. Stripe invoices, and a host disk snapshot if one already exists, are not removed by account deletion. The steps for a person who cannot delete the account in the app are in [complaints-and-deletion.md](complaints-and-deletion.md).

## Sign-in session

The session cookie is a 30-day inactivity limit. Using Hopewick slides it forward (`GET /api/auth/me` while the app is in use). It expires after 30 days unused. Signing out ends it immediately. The cookie stays httpOnly, SameSite=Lax, and Secure on HTTPS. One session per account.
