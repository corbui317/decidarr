# Decidarr

Decidarr picks something to watch from a Plex server's libraries for the people that server is shared with.

## People

**Admin**:
The person who set up the install and whose Plex server it serves.
_Avoid_: Owner, operator, server owner

**Friend**:
A Plex user the Admin's server is shared with, who has signed in to Decidarr and been approved by the Admin.
_Avoid_: Member, shared user, guest, approved user

**Pending Friend**:
A Plex user who has signed in to Decidarr but has not yet been approved by the Admin.
_Avoid_: Unapproved user

**Legacy data**:
Data stored before Decidarr supported multiple users, not yet owned by any Admin or Friend.
_Avoid_: Single-user data, owner data

**Session**:
The proof that a request comes from a specific Admin or Friend, whether it arrived from the web app or the mobile app.
_Avoid_: Auth context, login

## Picking

**Pool**:
The set of titles a Spin can choose from for one person, after their library selection and filters are applied.
_Avoid_: Candidates, selection set

**Spin**:
One random pick from a Pool, recorded in that person's spin history.
_Avoid_: Roll, random selection, pick
