import type {
  IdentityReadPort,
  IdentityUserSummary,
} from "../../identity/identity.public";

/** The other participant: id and public identity, no Sign-in Method data. */
export interface ConversationPeer {
  id: string;
  displayName: string | null;
  nameNumber: number;
  avatarIndex: number;
  avatarKey: string | null;
  deleted: boolean;
}

/**
 * The peer when no User row is found. Rows are kept after account deletion
 * and Conversations cascade with their Users, so this should not happen; it
 * answers as a deleted User, whose number and index the app does not show.
 */
export function missingPeer(id: string): ConversationPeer {
  return {
    id,
    displayName: null,
    nameNumber: 1000,
    avatarIndex: 0,
    avatarKey: null,
    deleted: true,
  };
}

/** The peer's public identity, or `missingPeer` when the User is not found. */
export function toConversationPeer(
  id: string,
  user: IdentityUserSummary | undefined,
): ConversationPeer {
  if (!user) return missingPeer(id);
  return {
    id,
    displayName: user.displayName,
    nameNumber: user.nameNumber,
    avatarIndex: user.avatarIndex,
    avatarKey: user.avatarKey,
    deleted: user.deleted,
  };
}

/** Public business identity never impersonates the creator or assigned human. */
export function toBusinessPeer(id: string, name: string): ConversationPeer {
  return { id, displayName: name, nameNumber: 1000, avatarIndex: 0, avatarKey: null, deleted: false };
}

export interface ConversationPeerView {
  peer: ConversationPeer;
  blockedByMe: boolean;
}

interface Participants {
  buyerId: string;
  sellerId: string;
}

export function peerIdOf(conversation: Participants, viewerId: string): string {
  return viewerId === conversation.buyerId
    ? conversation.sellerId
    : conversation.buyerId;
}

/**
 * Reads the other participant's public identity and the viewer's block state
 * for a set of Conversations with one identity read each, however many rows.
 * A peer that no longer exists answers as `missingPeer`.
 */
export async function readConversationPeers(
  identityRead: IdentityReadPort,
  viewerId: string,
  conversations: Participants[],
): Promise<Map<string, ConversationPeerView>> {
  const peerIds = [
    ...new Set(conversations.map((c) => peerIdOf(c, viewerId))),
  ];
  if (peerIds.length === 0) return new Map();

  const [users, blockedIds] = await Promise.all([
    identityRead.findUsersByIds(peerIds),
    identityRead.findBlockedUserIds(viewerId, peerIds),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const blocked = new Set(blockedIds);

  return new Map(
    peerIds.map((id) => [
      id,
      {
        peer: toConversationPeer(id, usersById.get(id)),
        blockedByMe: blocked.has(id),
      },
    ]),
  );
}
