// ===== Firestore CRUD 헬퍼 =====
import { db } from './firebase-config.js';
import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  getDocs, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ===== Users =====
export const getUser = (uid) => getDoc(doc(db, 'users', uid)).then(s => s.data());

export const getUserRef = (uid) => doc(db, 'users', uid);

export const updateUser = (uid, data) => updateDoc(doc(db, 'users', uid), data);

export const getUserByInviteCode = async (code) => {
  const q   = query(collection(db, 'users'), where('inviteCode', '==', code.toUpperCase()), limit(1));
  const res = await getDocs(q);
  if (res.empty) return null;
  const snap = res.docs[0];
  return { uid: snap.id, ...snap.data() };
};

// ===== Friends =====
export const addFriend = async (myUid, friendUid) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', myUid),     { friends: arrayUnion(friendUid) });
  batch.update(doc(db, 'users', friendUid), { friends: arrayUnion(myUid) });
  await batch.commit();
};

export const removeFriend = async (myUid, friendUid) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', myUid),     { friends: arrayRemove(friendUid) });
  batch.update(doc(db, 'users', friendUid), { friends: arrayRemove(myUid) });
  await batch.commit();
};

// 친구 목록 조회
export const getFriends = async (friendUids) => {
  if (!friendUids?.length) return [];
  const snaps = await Promise.all(friendUids.map(uid => getDoc(doc(db, 'users', uid))));
  return snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() }));
};

// ===== Meetings =====
export const createMeeting = async (data) => {
  const ref = await addDoc(collection(db, 'meetings'), {
    ...data,
    status:    'pending',
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getMeeting = (meetingId) =>
  getDoc(doc(db, 'meetings', meetingId)).then(s => s.exists() ? { id: s.id, ...s.data() } : null);

export const updateMeeting = (meetingId, data) =>
  updateDoc(doc(db, 'meetings', meetingId), data);

// 내가 멤버인 약속 구독
export const subscribeMyMeetings = (uid, callback) => {
  // members 서브컬렉션에서 내 uid 기반으로 쿼리 불가 → userMeetings + hostId 보완 조회
  const userMeetingsQuery = query(
    collection(db, 'userMeetings'),
    where('uid', '==', uid),
  );
  const hostMeetingsQuery = query(
    collection(db, 'meetings'),
    where('hostId', '==', uid),
  );

  let userMeetingDocs = [];
  let hostMeetings = [];

  const mergeAndCallback = async () => {
    const meetingIds = userMeetingDocs.map(d => d.data().meetingId);
    let userMeetings = [];
    if (meetingIds.length) {
      const meetings = await Promise.all(meetingIds.map(id => getMeeting(id).catch(() => null)));
      userMeetings = meetings.map((m, i) => {
        if (m) return m;
        const data = userMeetingDocs[i]?.data?.() || {};
        return {
          id: data.meetingId || meetingIds[i],
          title: data.title || '(알 수 없는 약속)',
          status: data.status || 'pending',
          scheduledAt: data.scheduledAt || null,
          place: data.placeName ? { name: data.placeName, address: data.placeAddress || '' } : null,
        };
      }).filter(Boolean);
    }

    const byId = new Map();
    for (const m of hostMeetings) byId.set(m.id, m);
    for (const m of userMeetings) byId.set(m.id, m);

    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
    callback(merged);
  };

  const unsubUser = onSnapshot(userMeetingsQuery, async (snap) => {
    userMeetingDocs = snap.docs;
    await mergeAndCallback();
  }, (err) => console.warn('userMeetings subscribe error:', err));

  const unsubHost = onSnapshot(hostMeetingsQuery, async (snap) => {
    hostMeetings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await mergeAndCallback();
  }, (err) => console.warn('hostMeetings subscribe error:', err));

  return () => { unsubUser(); unsubHost(); };
};

// ===== Meeting Members =====
export const getMemberRef = (meetingId, uid) =>
  doc(db, 'meetings', meetingId, 'members', uid);

export const setMember = (meetingId, uid, data) =>
  setDoc(doc(db, 'meetings', meetingId, 'members', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });

export const getMember = (meetingId, uid) =>
  getDoc(doc(db, 'meetings', meetingId, 'members', uid)).then(s => s.exists() ? s.data() : null);

export const subscribeMembers = (meetingId, callback) =>
  onSnapshot(collection(db, 'meetings', meetingId, 'members'), (snap) => {
    const members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    callback(members);
  });

export const updateMemberLocation = (meetingId, uid, lat, lng, eta) =>
  updateDoc(doc(db, 'meetings', meetingId, 'members', uid), {
    lat, lng, eta,
    updatedAt: serverTimestamp(),
  });

// 약속 초대: 멤버 추가 + userMeetings 기록
export const inviteMember = async (meetingId, uid, nickname, profileImg, meeting = {}) => {
  const batch = writeBatch(db);

  batch.set(doc(db, 'meetings', meetingId, 'members', uid), {
    nickname, profileImg: profileImg || null,
    status:   'invited',
    transport: null,
    lat: null, lng: null, eta: null,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'userMeetings', `${uid}_${meetingId}`), {
    uid, meetingId,
    title:     meeting.title || '(알 수 없는 약속)',
    status:    meeting.status || 'pending',
    scheduledAt: meeting.scheduledAt || null,
    placeName: meeting.place?.name || meeting.placeName || null,
    placeAddress: meeting.place?.address || meeting.placeAddress || null,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
};
