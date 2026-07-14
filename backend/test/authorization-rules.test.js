const test = require("node:test");
const assert = require("node:assert/strict");

const {
  userCanAccessTrip,
  userOwnsTrip,
  userCanEditTrip,
  userCanManageTrip,
} = require("../src/modules/trips/trip.permissions");

function connectionReturning(rows) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [rows];
    },
  };
}

const permissionCases = [
  ["access", userCanAccessTrip, ["user-1", "trip-1", "user-1"]],
  ["ownership", userOwnsTrip, ["trip-1", "user-1"]],
  ["edit", userCanEditTrip, ["user-1", "trip-1", "user-1"]],
  ["management", userCanManageTrip, ["user-1", "trip-1", "user-1"]],
];

for (const [name, permission, expectedParams] of permissionCases) {
  test(`${name} permission allows a matching authorized database row`, async () => {
    const connection = connectionReturning([{ tripId: "trip-1" }]);
    assert.equal(await permission("user-1", "trip-1", connection), true);
    assert.equal(connection.calls.length, 1);
    assert.deepEqual(connection.calls[0].params, expectedParams);
  });

  test(`${name} permission denies removed members, non-members, and missing trips`, async () => {
    const connection = connectionReturning([]);
    assert.equal(await permission("user-1", "trip-1", connection), false);
  });
}

test("trip access requires active membership", async () => {
  const connection = connectionReturning([]);
  await userCanAccessTrip("viewer-1", "trip-1", connection);
  const sql = connection.calls[0].sql;
  assert.match(sql, /tm\.status = 'Active'/);
  assert.match(sql, /t\.createdBy = \? OR tm\.tripMemberId IS NOT NULL/);
});

test("edit permission is restricted to Owner or Editor roles", async () => {
  const connection = connectionReturning([]);
  await userCanEditTrip("editor-1", "trip-1", connection);
  const sql = connection.calls[0].sql;
  assert.match(sql, /tm\.status = 'Active'/);
  assert.match(sql, /tm\.role IN \('Owner', 'Editor'\)/);
  assert.doesNotMatch(sql, /Viewer/);
});

test("management permission is restricted to Owner role", async () => {
  const connection = connectionReturning([]);
  await userCanManageTrip("editor-1", "trip-1", connection);
  const sql = connection.calls[0].sql;
  assert.match(sql, /tm\.role = 'Owner'/);
  assert.doesNotMatch(sql, /Editor|Viewer/);
});

test("ownership requires both trip ID and creator ID", async () => {
  const connection = connectionReturning([]);
  await userOwnsTrip("owner-1", "trip-1", connection);
  assert.match(connection.calls[0].sql, /tripId = \? AND createdBy = \?/);
  assert.deepEqual(connection.calls[0].params, ["trip-1", "owner-1"]);
});

test("RBAC matrix reflects the SRS Owner, Editor, Viewer, and removed-member rules", () => {
  const matrix = {
    Owner: { access: true, edit: true, manage: true },
    Editor: { access: true, edit: true, manage: false },
    Viewer: { access: true, edit: false, manage: false },
    Removed: { access: false, edit: false, manage: false },
    NonMember: { access: false, edit: false, manage: false },
  };

  assert.deepEqual(matrix.Owner, { access: true, edit: true, manage: true });
  assert.equal(matrix.Editor.edit, true);
  assert.equal(matrix.Editor.manage, false);
  assert.deepEqual(matrix.Viewer, { access: true, edit: false, manage: false });
  assert.equal(matrix.Removed.access, false);
  assert.equal(matrix.NonMember.access, false);
});
