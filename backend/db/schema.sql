-- TripMate MySQL Schema (Week 2)
-- Focus: Users + Profiles (from SRS data dictionary)

-- Create database (adjust name if your team uses a different convention)
CREATE DATABASE IF NOT EXISTS tripmate
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tripmate;

-- Users
CREATE TABLE IF NOT EXISTS Users (
  userId VARCHAR(50) PRIMARY KEY,
  firstName VARCHAR(50) NOT NULL,
  lastName VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastLoginAt DATETIME NULL
) ENGINE=InnoDB;

-- Profiles (1:1 with Users)
CREATE TABLE IF NOT EXISTS Profiles (
  profileId VARCHAR(50) PRIMARY KEY,
  userId VARCHAR(50) NOT NULL UNIQUE,
  displayName VARCHAR(50) NULL,
  avatarUrl LONGTEXT NULL,
  locale VARCHAR(10) NULL,
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Trips
CREATE TABLE IF NOT EXISTS Trips (
  tripId VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  startDate DATE NULL,
  endDate DATE NULL,
  destinationCity VARCHAR(50) NULL,
  destinationCountry VARCHAR(50) NULL,
  destinationTimezone VARCHAR(20) NULL,
  createdBy VARCHAR(50) NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'Private',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trips_created_by
    FOREIGN KEY (createdBy) REFERENCES Users(userId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Trip details (UI metadata for trip cards / create-edit form)
CREATE TABLE IF NOT EXISTS TripDetails (
  tripId VARCHAR(50) PRIMARY KEY,
  tripType VARCHAR(20) NULL,
  collaborators TEXT NULL,
  budgetCurrency VARCHAR(10) NULL,
  budgetVersion INT NOT NULL DEFAULT 1,
  tripImage LONGTEXT NULL,
  CONSTRAINT fk_tripdetails_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Trip members / collaboration
CREATE TABLE IF NOT EXISTS TripMembers (
  tripMemberId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  userId VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'Viewer',
  joinedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_tripmembers_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_tripmembers_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_tripmembers_trip_user (tripId, userId)
) ENGINE=InnoDB;

-- Itinerary days
CREATE TABLE IF NOT EXISTS ItineraryDays (
  itineraryDayId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  date DATE NULL,
  notes TEXT NULL,
  CONSTRAINT fk_itinerarydays_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Itinerary items
CREATE TABLE IF NOT EXISTS ItineraryItems (
  itemId VARCHAR(50) PRIMARY KEY,
  itineraryDayId VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  startTime TIME NULL,
  endTime TIME NULL,
  `order` INT NULL,
  notes TEXT NULL,
  placeId VARCHAR(50) NULL,
  lat DECIMAL(9,6) NULL,
  lng DECIMAL(9,6) NULL,
  version INT NOT NULL DEFAULT 1,
  updatedAt DATETIME NULL,
  CONSTRAINT fk_itineraryitems_day
    FOREIGN KEY (itineraryDayId) REFERENCES ItineraryDays(itineraryDayId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Short-lived collaborative edit locks prevent two users editing the same item.
CREATE TABLE IF NOT EXISTS EditLocks (
  lockId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  entityType VARCHAR(50) NOT NULL,
  entityId VARCHAR(50) NOT NULL,
  lockedBy VARCHAR(50) NOT NULL,
  lockedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NOT NULL,
  CONSTRAINT fk_editlocks_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_editlocks_user
    FOREIGN KEY (lockedBy) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_editlocks_entity (entityType, entityId),
  KEY idx_editlocks_trip (tripId),
  KEY idx_editlocks_expiry (expiresAt)
) ENGINE=InnoDB;

-- Comments for trips / itinerary items
CREATE TABLE IF NOT EXISTS Comments (
  commentId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  itemId VARCHAR(50) NULL,
  userId VARCHAR(50) NOT NULL,
  commentText TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL,
  CONSTRAINT fk_comments_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_comments_item
    FOREIGN KEY (itemId) REFERENCES ItineraryItems(itemId)
    ON DELETE CASCADE,
  CONSTRAINT fk_comments_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Invitations for trip collaboration by email
CREATE TABLE IF NOT EXISTS Invitations (
  invitationId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  inviterUserId VARCHAR(50) NOT NULL,
  inviteeEmail VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'Viewer',
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  invitationToken VARCHAR(255) NOT NULL,
  message TEXT NULL,
  expiresAt DATETIME NULL,
  respondedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invitations_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_invitations_inviter
    FOREIGN KEY (inviterUserId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_invitations_token (invitationToken),
  UNIQUE KEY uq_invitations_trip_email_pending (tripId, inviteeEmail, status),
  KEY idx_invitations_email (inviteeEmail),
  KEY idx_invitations_status (status)
) ENGINE=InnoDB;

-- Destination details separated from trips for SRS alignment
CREATE TABLE IF NOT EXISTS Destinations (
  destinationId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  formattedAddress VARCHAR(255) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  timezone VARCHAR(50) NULL,
  notes TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL,
  CONSTRAINT fk_destinations_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_destinations_trip (tripId)
) ENGINE=InnoDB;

-- Pins attached to a trip map
CREATE TABLE IF NOT EXISTS PlacePins (
  pinId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  createdBy VARCHAR(50) NULL,
  title VARCHAR(150) NOT NULL,
  address VARCHAR(255) NULL,
  category VARCHAR(50) NULL,
  description TEXT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  visitDate DATE NULL,
  sortOrder INT NULL,
  source VARCHAR(50) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL,
  CONSTRAINT fk_placepins_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_placepins_user
    FOREIGN KEY (createdBy) REFERENCES Users(userId)
    ON DELETE SET NULL,
  KEY idx_placepins_trip (tripId),
  KEY idx_placepins_trip_sort (tripId, sortOrder)
) ENGINE=InnoDB;

-- Budget tracking entries
CREATE TABLE IF NOT EXISTS Expenses (
  expenseId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  paidBy VARCHAR(50) NULL,
  paidByName VARCHAR(100) NULL,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
  category VARCHAR(50) NULL,
  isShared TINYINT(1) NOT NULL DEFAULT 0,
  expenseDate DATE NULL,
  notes TEXT NULL,
  displayOrder INT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL,
  CONSTRAINT fk_expenses_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_expenses_paid_by
    FOREIGN KEY (paidBy) REFERENCES Users(userId)
    ON DELETE RESTRICT,
  KEY idx_expenses_trip (tripId),
  KEY idx_expenses_paid_by (paidBy)
) ENGINE=InnoDB;

-- Per-user share allocations for shared expenses
CREATE TABLE IF NOT EXISTS ExpenseShares (
  expenseShareId VARCHAR(50) PRIMARY KEY,
  expenseId VARCHAR(50) NOT NULL,
  userId VARCHAR(50) NULL,
  participantName VARCHAR(100) NULL,
  shareAmount DECIMAL(10,2) NOT NULL,
  settlementStatus VARCHAR(20) NOT NULL DEFAULT 'Pending',
  settledAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenseshares_expense
    FOREIGN KEY (expenseId) REFERENCES Expenses(expenseId)
    ON DELETE CASCADE,
  CONSTRAINT fk_expenseshares_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_expenseshares_expense_user (expenseId, userId),
  UNIQUE KEY uq_expenseshares_expense_participant (expenseId, participantName),
  KEY idx_expenseshares_user (userId)
) ENGINE=InnoDB;

-- User-triggered AI recommendation queries
CREATE TABLE IF NOT EXISTS RecommendationRequests (
  recommendationRequestId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  requestedBy VARCHAR(50) NULL,
  tags TEXT NULL,
  prompt TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Completed',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME NULL,
  CONSTRAINT fk_recommendationrequests_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_recommendationrequests_user
    FOREIGN KEY (requestedBy) REFERENCES Users(userId)
    ON DELETE SET NULL,
  KEY idx_recommendationrequests_trip (tripId)
) ENGINE=InnoDB;

-- AI-generated recommendation results
CREATE TABLE IF NOT EXISTS Recommendations (
  recommendationId VARCHAR(50) PRIMARY KEY,
  recommendationRequestId VARCHAR(50) NOT NULL,
  pinId VARCHAR(50) NULL,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) NULL,
  description TEXT NULL,
  categoryTag VARCHAR(50) NULL,
  rationale TEXT NULL,
  rankOrder INT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recommendations_request
    FOREIGN KEY (recommendationRequestId) REFERENCES RecommendationRequests(recommendationRequestId)
    ON DELETE CASCADE,
  CONSTRAINT fk_recommendations_pin
    FOREIGN KEY (pinId) REFERENCES PlacePins(pinId)
    ON DELETE SET NULL,
  KEY idx_recommendations_request (recommendationRequestId),
  KEY idx_recommendations_pin (pinId)
) ENGINE=InnoDB;

-- User feedback on recommendations
CREATE TABLE IF NOT EXISTS Ratings (
  ratingId VARCHAR(50) PRIMARY KEY,
  recommendationId VARCHAR(50) NOT NULL,
  userId VARCHAR(50) NOT NULL,
  ratingValue TINYINT NOT NULL,
  feedbackText TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ratings_recommendation
    FOREIGN KEY (recommendationId) REFERENCES Recommendations(recommendationId)
    ON DELETE CASCADE,
  CONSTRAINT fk_ratings_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_ratings_recommendation_user (recommendationId, userId),
  KEY idx_ratings_user (userId)
) ENGINE=InnoDB;

-- Persistent AI assistant chat history for each trip
CREATE TABLE IF NOT EXISTS AIChatMessages (
  aiChatMessageId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  userId VARCHAR(50) NULL,
  recommendationRequestId VARCHAR(50) NULL,
  role VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  tags TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aichatmessages_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_aichatmessages_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE SET NULL,
  CONSTRAINT fk_aichatmessages_request
    FOREIGN KEY (recommendationRequestId) REFERENCES RecommendationRequests(recommendationRequestId)
    ON DELETE SET NULL,
  KEY idx_aichatmessages_trip_created (tripId, createdAt),
  KEY idx_aichatmessages_request (recommendationRequestId)
) ENGINE=InnoDB;

-- In-app notifications for collaboration and system events
CREATE TABLE IF NOT EXISTS Notifications (
  notificationId VARCHAR(50) PRIMARY KEY,
  userId VARCHAR(50) NOT NULL,
  tripId VARCHAR(50) NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  isRead TINYINT(1) NOT NULL DEFAULT 0,
  readAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  CONSTRAINT fk_notifications_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  KEY idx_notifications_user_read (userId, isRead),
  KEY idx_notifications_trip (tripId)
) ENGINE=InnoDB;

-- Audit trail for sensitive changes
CREATE TABLE IF NOT EXISTS AuditLogs (
  auditLogId VARCHAR(50) PRIMARY KEY,
  userId VARCHAR(50) NULL,
  tripId VARCHAR(50) NULL,
  entityType VARCHAR(50) NOT NULL,
  entityId VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  beforeState JSON NULL,
  afterState JSON NULL,
  metadata JSON NULL,
  ipAddress VARCHAR(45) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditlogs_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE SET NULL,
  CONSTRAINT fk_auditlogs_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE SET NULL,
  KEY idx_auditlogs_user (userId),
  KEY idx_auditlogs_trip (tripId),
  KEY idx_auditlogs_entity (entityType, entityId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS RecommendationRequests (
  recommendationRequestId VARCHAR(50) PRIMARY KEY,
  tripId VARCHAR(50) NOT NULL,
  requestedBy VARCHAR(50) NULL,
  tags TEXT NULL,
  prompt TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Completed',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME NULL,
  CONSTRAINT fk_recommendationrequests_trip
    FOREIGN KEY (tripId) REFERENCES Trips(tripId)
    ON DELETE CASCADE,
  CONSTRAINT fk_recommendationrequests_user
    FOREIGN KEY (requestedBy) REFERENCES Users(userId)
    ON DELETE SET NULL,
  KEY idx_recommendationrequests_trip (tripId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Recommendations (
  recommendationId VARCHAR(50) PRIMARY KEY,
  recommendationRequestId VARCHAR(50) NOT NULL,
  pinId VARCHAR(50) NULL,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) NULL,
  description TEXT NULL,
  categoryTag VARCHAR(50) NULL,
  rationale TEXT NULL,
  rankOrder INT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recommendations_request
    FOREIGN KEY (recommendationRequestId) REFERENCES RecommendationRequests(recommendationRequestId)
    ON DELETE CASCADE,
  CONSTRAINT fk_recommendations_pin
    FOREIGN KEY (pinId) REFERENCES PlacePins(pinId)
    ON DELETE SET NULL,
  KEY idx_recommendations_request (recommendationRequestId),
  KEY idx_recommendations_pin (pinId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Ratings (
  ratingId VARCHAR(50) PRIMARY KEY,
  recommendationId VARCHAR(50) NOT NULL,
  userId VARCHAR(50) NOT NULL,
  ratingValue TINYINT NOT NULL,
  feedbackText TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ratings_recommendation
    FOREIGN KEY (recommendationId) REFERENCES Recommendations(recommendationId)
    ON DELETE CASCADE,
  CONSTRAINT fk_ratings_user
    FOREIGN KEY (userId) REFERENCES Users(userId)
    ON DELETE CASCADE,
  UNIQUE KEY uq_ratings_recommendation_user (recommendationId, userId),
  KEY idx_ratings_user (userId)
) ENGINE=InnoDB;
