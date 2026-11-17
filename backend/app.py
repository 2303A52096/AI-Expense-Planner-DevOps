
import os
import re
import uuid
from datetime import datetime, timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash


class MemoryCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, key, direction=-1):
        self.items = sorted(
            self.items,
            key=lambda item: item.get(key, 0),
            reverse=direction == -1,
        )
        return self

    def __iter__(self):
        return iter(self.items)

    def __len__(self):
        return len(self.items)


class MemoryCollection:
    def __init__(self, name):
        self.name = name
        self.items = []
        self.unique_fields = set()

    def create_index(self, field, unique=False):
        if unique:
            self.unique_fields.add(field)

    def _matches(self, item, query):
        for key, expected in (query or {}).items():
            value = item.get(key)

            if isinstance(expected, dict):
                if "$regex" in expected:
                    pattern = expected["$regex"]
                    if re.search(pattern, str(value or "")) is None:
                        return False
                    continue
                if "$in" in expected:
                    if value not in expected["$in"]:
                        return False
                    continue
                return False

            if value != expected:
                return False

        return True

    def insert_one(self, document):
        doc = dict(document)
        if "_id" not in doc:
            doc["_id"] = str(uuid.uuid4())

        for field in self.unique_fields:
            if any(item.get(field) == doc.get(field) for item in self.items):
                raise DuplicateKeyError(f"Duplicate key for {field}")

        self.items.append(doc)
        return type("InsertResult", (), {"inserted_id": doc["_id"]})()

    def find_one(self, query):
        for item in self.items:
            if self._matches(item, query):
                return item
        return None

    def find(self, query=None):
        query = query or {}
        items = [item for item in self.items if self._matches(item, query)]
        return MemoryCursor(items)

    def update_one(self, query, update, upsert=False):
        item = self.find_one(query)

        if item is None:
            if not upsert:
                return None

            new_doc = dict(query)
            new_doc.update(update.get("$set", {}))
            if "_id" not in new_doc:
                new_doc["_id"] = str(uuid.uuid4())
            self.items.append(new_doc)
            return None

        updates = update.get("$set", {})
        for key, value in updates.items():
            item[key] = value
        return None

load_dotenv()

app = Flask(__name__)
CORS(app)

# JWT configuration
app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY",
    "development-secret-change-this-before-deployment"
)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=12)

jwt = JWTManager(app)

# MongoDB connection with an in-memory fallback for local development
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
USE_MEMORY_DB = False

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client["expense_planner"]
    users = db["users"]
    transactions = db["transactions"]
    budgets = db["budgets"]
    users.create_index("email", unique=True)
    print("MongoDB connected successfully!")
except Exception as exc:  # pragma: no cover - fallback for local-only environments
    USE_MEMORY_DB = True
    users = MemoryCollection("users")
    transactions = MemoryCollection("transactions")
    budgets = MemoryCollection("budgets")
    users.create_index("email", unique=True)
    print(f"MongoDB unavailable, using in-memory storage: {exc}")


# HOME API
@app.route("/")
def home():
    return jsonify({
        "message": "AI Expense Planner Backend is running!",
        "status": "success"
    })


# HEALTH API
@app.route("/api/health")
def health():
    return jsonify({
        "status": "success",
        "database": "Connected"
    })


# USER REGISTRATION API
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({"error": "Name, email and password are required"}), 400

    if "@" not in email:
        return jsonify({"error": "Enter a valid email address"}), 400

    if len(password) < 8:
        return jsonify({"error": "Password must contain at least 8 characters"}), 400

    hashed_password = generate_password_hash(password)

    new_user = {
        "name": name,
        "email": email,
        "password": hashed_password,
        "role": "user",
        "created_at": datetime.utcnow()
    }

    try:
        result = users.insert_one(new_user)
    except DuplicateKeyError:
        return jsonify({"error": "Email is already registered"}), 409

    return jsonify({
        "message": "Registration successful!",
        "user_id": str(result.inserted_id)
    }), 201


# USER LOGIN API
@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = users.find_one({"email": email})

    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(
        identity=str(user["_id"])
    )

    return jsonify({
        "message": "Login successful!",
        "access_token": access_token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    }), 200


# GET LOGGED-IN USER PROFILE
@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()

    if USE_MEMORY_DB:
        user = users.find_one({"_id": user_id})
    else:
        from bson import ObjectId

        user = users.find_one({"_id": ObjectId(user_id)})

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"]
    }), 200


# ADD TRANSACTION API
@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    data = request.get_json(silent=True) or {}

    transaction_type = data.get("type")
    amount = data.get("amount")
    category = data.get("category")
    description = data.get("description", "")

    if transaction_type not in ["income", "expense"]:
        return jsonify({"error": "Type must be income or expense"}), 400

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"error": "Amount must be positive"}), 400

    if not isinstance(category, str) or not category.strip():
        return jsonify({"error": "Category is required"}), 400

    date = data.get("date") or datetime.now().strftime("%Y-%m-%d")

    try:
        datetime.strptime(date, "%Y-%m-%d")
    except (TypeError, ValueError):
        return jsonify({"error": "Date must be YYYY-MM-DD"}), 400

    new_transaction = {
        "type": transaction_type,
        "amount": amount,
        "category": category.strip(),
        "description": description,
        "date": date,
        "created_at": datetime.utcnow()
    }

    result = transactions.insert_one(new_transaction)
    new_transaction["_id"] = str(result.inserted_id)
    new_transaction["created_at"] = new_transaction["created_at"].isoformat()

    return jsonify({
        "message": "Transaction added successfully!",
        "transaction": new_transaction
    }), 201


# GET ALL TRANSACTIONS API
@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    all_transactions = transactions.find().sort("created_at", -1)

    result = []

    for item in all_transactions:
        item["_id"] = str(item["_id"])
        item["created_at"] = item["created_at"].isoformat()
        result.append(item)

    return jsonify({
        "count": len(result),
        "transactions": result
    })


# ADD OR UPDATE MONTHLY BUDGET
@app.route("/api/budgets", methods=["POST"])
def add_budget():
    data = request.get_json(silent=True) or {}

    category = data.get("category")
    month = data.get("month")
    amount = data.get("amount")

    if not category or not isinstance(category, str) or not category.strip():
        return jsonify({"message": "Category is required"}), 400

    if not month or not isinstance(month, str):
        return jsonify({"message": "Month is required"}), 400

    try:
        datetime.strptime(month, "%Y-%m")
        amount = float(amount)
        if amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"message": "Enter a valid month and positive amount"}), 400

    budgets.update_one(
        {"category": category.strip(), "month": month},
        {"$set": {
            "category": category.strip(),
            "month": month,
            "amount": amount
        }},
        upsert=True
    )

    return jsonify({
        "message": "Budget saved successfully!"
    }), 201


# GET ALL BUDGETS WITH ACTUAL SPENDING
@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    all_budgets = list(budgets.find())

    result = []

    for budget in all_budgets:
        spent = 0

        matching_transactions = transactions.find({
            "type": "expense",
            "category": budget["category"],
            "date": {
                "$regex": "^" + budget["month"]
            }
        })

        for transaction in matching_transactions:
            spent += float(transaction["amount"])

        budget_amount = float(budget["amount"])

        result.append({
            "category": budget["category"],
            "month": budget["month"],
            "amount": budget_amount,
            "spent": spent,
            "remaining": budget_amount - spent,
            "percentage": round((spent / budget_amount) * 100, 2)
        })

    return jsonify({
        "count": len(result),
        "budgets": result
    }), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
