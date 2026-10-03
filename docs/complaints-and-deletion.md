# Complaints and account-deletion requests

This is a written procedure for a person. It is not a ticketing system. Nothing in the app emails staff when someone complains, and nothing in the app shows a chat to staff.

Mailbox: **admin@bridge-bite-co.com**. Do not invent another address.

## Chat retention

A chat is kept on the live server until the person deletes that chat, deletes the account, or it has not been updated for 24 months, and then it is removed. 24 months is 730 days, measured from the conversation `updated` time. Free and Plus are the same. A free account can open the latest chat. Older chats can still be stored. Not seeing them is not deletion. Plus can open stored history that is still there. The browser copy is not deleted from here. See [data-retention.md](data-retention.md).

## Complaints

1. Read the email at admin@bridge-bite-co.com.
2. Aim to acknowledge it within 2 business days. Aim to resolve it within 10 business days. Those are targets, not a guarantee, and the public pages say so.
3. Reply from that same mailbox. Say what you will do, or what you cannot do.
4. Do not promise a clinician review, a human watching chats, or a refund the Australian Consumer Law does not require. A period already charged is not partly refunded except where that law requires it.
5. Keep the email. There is no complaint record inside the app.

## Account deletion by email

Use this when the person cannot use My Account → Delete account.

1. The request must come from the account’s sign-in email, to admin@bridge-bite-co.com, and it must ask for the account to be deleted.
2. If the address does not match an account, reply and say no matching account was found. Do not delete a different account.
3. Sign in is not done by this document. A person with access to the server data deletes that account the same way the app does:
   - cancel a current Stripe subscription immediately (Stripe Dashboard, or the same `DELETE /subscriptions/{id}` the app uses)
   - remove that account’s row from the account file
   - remove that account’s chats
   - remove that account’s check-ins and weekly goals
4. Reply to the person and say what was deleted and what remains.
   - Deleted: the sign-in (email, name, phone, password), server chats, and server check-ins and weekly goals. The person is signed out. A current subscription is cancelled.
   - Remains: a copy in the browser until they clear it in Settings; Stripe can keep invoices; existing Render disk snapshots can still hold older data. This request does not wipe a disk snapshot, and this does not promise they disappear at once. On 3 October 2026 the newest snapshot was restored onto the live disk. Files were not compared one by one. Do not say a snapshot was wiped, and do not say how long one is kept.
5. Do not delete the Stripe Customer object unless a later decision says to. Do not store or ask for the card number.

In-app deletion already does the server part when the person types DELETE and confirms it is them (current password if they have one, otherwise a fresh email sign-in link or Google sign-in). This email path is only for people who cannot do that.
