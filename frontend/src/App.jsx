import { useState, useEffect } from "react";
import axios from "axios";

import {
  LayoutDashboard,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  PieChart,
  Settings,
  Plus,
  Sparkles,
  User,
  IndianRupee,
  LogOut,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
} from "recharts";

import "./App.css";

const API_URL = "/api";

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .split("T")[0];
};

function App() {

  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("expense_token")}`,
  });

  const [activePage, setActivePage] = useState("Dashboard");

  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [profile, setProfile] = useState({
    name: "Expense Planner User",
    email: "",
    currency: "INR",
  });

  const [formData, setFormData] = useState({
    type: "expense",
    amount: "",
    category: "Food",
    description: "",
    date: today(),
  });

  const [budgetForm, setBudgetForm] = useState({
    category: "Travel",
    month: "2026-11",
    amount: "",
  });

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Transactions", icon: Wallet },
    { name: "Budgets", icon: PieChart },
    { name: "Reports", icon: ArrowDownCircle },
    { name: "AI Insights", icon: Sparkles },
    { name: "Settings", icon: Settings },
  ];

  // Currency formatter
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: profile.currency,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  // Fetch transactions and ensure the demo has at least 20 records.
  const fetchTransactions = async () => {
    try {
      let response = await axios.get(`${API_URL}/transactions`);
      let records = response.data.transactions || [];

      if (records.length < 20) {
        const seedResponse = await axios.post(`${API_URL}/transactions/seed`);
        if (seedResponse.data.added > 0) {
          response = await axios.get(`${API_URL}/transactions`);
          records = response.data.transactions || [];
          setSuccess(`${seedResponse.data.added} sample records added successfully!`);
        }
      }

      setTransactions(records);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch budgets
  const fetchBudgets = async () => {
    try {
      const response = await axios.get(`${API_URL}/budgets`);
      setBudgets(response.data.budgets || []);
    } catch (err) {
      console.error(err);
      setError("Unable to load budgets.");
    }
  };

  // Restore an existing login session, if a valid token is saved.
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("expense_token");

      if (!token) {
        setAuthReady(true);
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser(response.data);
        setProfile((previous) => ({
          ...previous,
          name: response.data.name,
          email: response.data.email,
        }));
        await Promise.all([fetchTransactions(), fetchBudgets()]);
      } catch (err) {
        localStorage.removeItem("expense_token");
        setCurrentUser(null);
        setLoading(false);
      } finally {
        setAuthReady(true);
      }
    };

    restoreSession();
  }, []);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        await axios.post(`${API_URL}/auth/register`, authForm);
        setSuccess("Registration successful! Please log in.");
        setAuthMode("login");
        setAuthForm({ name: "", email: authForm.email, password: "" });
      } else {
        const response = await axios.post(`${API_URL}/auth/login`, {
          email: authForm.email,
          password: authForm.password,
        });

        localStorage.setItem("expense_token", response.data.access_token);
        setCurrentUser(response.data.user);
        setProfile((previous) => ({
          ...previous,
          name: response.data.user.name,
          email: response.data.user.email,
        }));
        setSuccess("Login successful!");
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchBudgets()]);
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Authentication failed. Please try again."
      );
    } finally {
      setAuthLoading(false);
      setAuthReady(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("expense_token");
    setCurrentUser(null);
    setTransactions([]);
    setBudgets([]);
    setActivePage("Dashboard");
    setError("");
    setSuccess("You have been logged out.");
    setLoading(false);
  };

  // Dashboard calculations
  const totalIncome = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const totalExpenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const totalBalance = totalIncome - totalExpenses;

  // Transaction input
  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Add transaction
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      await axios.post(`${API_URL}/transactions`, {
        ...formData,
        amount: Number(formData.amount),
      });

      setSuccess("Transaction added successfully!");

      setFormData({
        type: "expense",
        amount: "",
        category: "Food",
        description: "",
        date: today(),
      });

      await fetchTransactions();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Could not add transaction."
      );
    }
  };

  // Budget input
  const handleBudgetSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      await axios.post(`${API_URL}/budgets`, {
        ...budgetForm,
        amount: Number(budgetForm.amount),
      });

      setSuccess("Monthly budget saved successfully!");

      setBudgetForm((previous) => ({
        ...previous,
        amount: "",
      }));

      await fetchBudgets();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Could not save budget."
      );
    }
  };

  // Transaction list
  const transactionList = (items) =>
    items.length === 0 ? (
      <p>No transactions found.</p>
    ) : (
      items.map((item) => (
        <div className="transaction" key={item._id}>
          <div>
            <strong>{item.category}</strong>
            <p>{item.description || "No description"}</p>
            <small>{item.date}</small>
          </div>

          <strong className={item.type === "income" ? "income" : "expense"}>
            {item.type === "income" ? "+ " : "- "}
            {formatCurrency(Number(item.amount))}
          </strong>
        </div>
      ))
    );

  // Monthly report data
  const monthlyReport = Object.values(
    transactions.reduce((result, item) => {
      const month = (item.date || "").slice(0, 7);
      if (!month) return result;

      if (!result[month]) {
        result[month] = {
          month,
          income: 0,
          expenses: 0,
        };
      }

      if (item.type === "income") {
        result[month].income += Number(item.amount);
      } else {
        result[month].expenses += Number(item.amount);
      }

      return result;
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month));

  // Category report data
  const categoryReport = Object.values(
    transactions
      .filter((item) => item.type === "expense")
      .reduce((result, item) => {
        const category = item.category || "Other";

        if (!result[category]) {
          result[category] = {
            category,
            amount: 0,
          };
        }

        result[category].amount += Number(item.amount);
        return result;
      }, {})
  );

  // AI insight calculations (rule-based analysis)
  const highestCategory = [...categoryReport].sort(
    (a, b) => b.amount - a.amount
  )[0];

  const totalBudget = budgets.reduce(
    (sum, budget) => sum + Number(budget.amount),
    0
  );

  const totalSpentBudget = budgets.reduce(
    (sum, budget) => sum + Number(budget.spent),
    0
  );

  const budgetUsage =
    totalBudget > 0
      ? (totalSpentBudget / totalBudget) * 100
      : 0;

  if (!authReady) {
    return <div className="auth-screen"><section className="auth-card"><h2>ExpenseAI</h2><p>Checking your session...</p></section></div>;
  }

  if (!currentUser) {
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <h1>ExpenseAI</h1>
          <p className="auth-subtitle">Smart Money Management</p>
          <h2>{authMode === "login" ? "Welcome Back" : "Create Your Account"}</h2>
          <p>{authMode === "login" ? "Sign in to continue to your dashboard." : "Register to start managing your finances."}</p>

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}

          <form className="transaction-form" onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <>
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  required
                />
              </>
            )}
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              required
            />
            <label>Password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              minLength={8}
              required
            />
            <button className="add-button" type="submit" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "login" ? "Login" : "Create Account"}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
            {" "}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setError("");
                setSuccess("");
              }}
            >
              {authMode === "login" ? "Register" : "Login"}
            </button>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h2>ExpenseAI</h2>
        <p className="tagline">Smart Money Management</p>

        <nav>
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={
                  activePage === item.name
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => {
                  setActivePage(item.name);
                  setError("");
                  setSuccess("");
                }}
              >
                <Icon size={19} />
                {item.name}
              </button>
            );
          })}
          <button
            type="button"
            className="nav-item"
            onClick={handleLogout}
          >
            <LogOut size={19} />
            Logout
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>Welcome to your personal finance dashboard.</p>
          </div>

          <button
            className="add-button"
            onClick={() => setActivePage("Transactions")}
          >
            <Plus size={18} /> Add Transaction
          </button>
        </header>

        {error && (
          <p style={{ color: "red", marginBottom: "15px" }}>
            {error}
          </p>
        )}

        {success && (
          <p style={{ color: "green", marginBottom: "15px" }}>
            {success}
          </p>
        )}

        {loading ? (
          <section className="panel">
            <p>Loading your financial data...</p>
          </section>
        ) : activePage === "Dashboard" ? (
          /* DASHBOARD */
          <>
            <section className="summary-grid">
              <div className="summary-card">
                <p>Total Balance</p>
                <h2>{formatCurrency(totalBalance)}</h2>
                <span>Income minus expenses</span>
              </div>

              <div className="summary-card">
                <p>Total Income</p>
                <h2>{formatCurrency(totalIncome)}</h2>
                <span>Recorded income</span>
              </div>

              <div className="summary-card">
                <p>Total Expenses</p>
                <h2>{formatCurrency(totalExpenses)}</h2>
                <span>Recorded expenses</span>
              </div>

              <div className="summary-card">
                <p>Total Transactions</p>
                <h2>{transactions.length}</h2>
                <span>Transactions recorded</span>
              </div>
            </section>

            <section className="content-grid">
              <div className="panel">
                <h3>Recent Transactions</h3>
                {transactionList(transactions.slice(0, 5))}
              </div>

              <div className="panel">
                <h3>AI Financial Insights</h3>
                <p className="insight">
                  You have recorded {transactions.length} transaction(s),
                  with total expenses of {formatCurrency(totalExpenses)}.
                  Keep tracking your spending to understand your habits.
                </p>
              </div>
            </section>
          </>
        ) : activePage === "Transactions" ? (
          /* TRANSACTIONS */
          <>
            <section className="panel">
              <h3>Add New Transaction</h3>

              <form onSubmit={handleSubmit} className="transaction-form">
                <label>Transaction Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>

                <label>Amount (₹)</label>
                <input
                  type="number"
                  name="amount"
                  placeholder="Enter amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  min="0.01"
                  step="0.01"
                  required
                />

                <label>Category</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                >
                  <option>Food</option>
                  <option>Shopping</option>
                  <option>Travel</option>
                  <option>Education</option>
                  <option>Health</option>
                  <option>Entertainment</option>
                  <option>Salary</option>
                  <option>Business</option>
                  <option>Other</option>
                </select>

                <label>Description</label>
                <input
                  type="text"
                  name="description"
                  placeholder="Enter description"
                  value={formData.description}
                  onChange={handleInputChange}
                />

                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  required
                />

                <button type="submit" className="add-button">
                  <Plus size={18} /> Save Transaction
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>All Transactions ({transactions.length})</h3>
              {transactionList(transactions)}
            </section>
          </>
        ) : activePage === "Budgets" ? (
          /* BUDGETS */
          <>
            <section className="panel">
              <h3>Create Monthly Budget</h3>

              <form
                onSubmit={handleBudgetSubmit}
                className="transaction-form"
              >
                <label>Category</label>
                <select
                  value={budgetForm.category}
                  onChange={(e) =>
                    setBudgetForm({
                      ...budgetForm,
                      category: e.target.value,
                    })
                  }
                >
                  <option>Food</option>
                  <option>Shopping</option>
                  <option>Travel</option>
                  <option>Education</option>
                  <option>Health</option>
                  <option>Entertainment</option>
                  <option>Other</option>
                </select>

                <label>Month</label>
                <input
                  type="month"
                  value={budgetForm.month}
                  onChange={(e) =>
                    setBudgetForm({
                      ...budgetForm,
                      month: e.target.value,
                    })
                  }
                  required
                />

                <label>Budget Amount (₹)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter monthly budget"
                  value={budgetForm.amount}
                  onChange={(e) =>
                    setBudgetForm({
                      ...budgetForm,
                      amount: e.target.value,
                    })
                  }
                  required
                />

                <button type="submit" className="add-button">
                  <Plus size={18} /> Save Budget
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>Monthly Budget Overview</h3>

              {budgets.length === 0 ? (
                <p>No budgets created yet.</p>
              ) : (
                budgets.map((budget) => (
                  <div
                    key={`${budget.category}-${budget.month}`}
                    style={{
                      padding: "18px 0",
                      borderBottom: "1px solid #e8ebf2",
                    }}
                  >
                    <div className="transaction">
                      <div>
                        <strong>{budget.category}</strong>
                        <p>{budget.month}</p>
                      </div>

                      <strong>
                        {formatCurrency(budget.spent)} /{" "}
                        {formatCurrency(budget.amount)}
                      </strong>
                    </div>

                    <div
                      style={{
                        background: "#e8ebf2",
                        height: "10px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        margin: "12px 0",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(budget.percentage, 100)}%`,
                          background:
                            budget.percentage >= 100
                              ? "#dc2626"
                              : budget.percentage >= 80
                              ? "#f59e0b"
                              : "#16a34a",
                          height: "100%",
                          borderRadius: "10px",
                        }}
                      />
                    </div>

                    <div className="transaction">
                      <span>{budget.percentage.toFixed(1)}% used</span>

                      <strong
                        style={{
                          color:
                            budget.remaining < 0
                              ? "#dc2626"
                              : "#16a34a",
                        }}
                      >
                        {budget.remaining < 0
                          ? `${formatCurrency(Math.abs(budget.remaining))} over budget`
                          : `${formatCurrency(budget.remaining)} remaining`}
                      </strong>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        ) : activePage === "Reports" ? (
          /* REPORTS */
          <>
            <section className="panel">
              <h3>Monthly Expense Report</h3>
              <p>Track your expenses month by month.</p>

              {monthlyReport.length === 0 ? (
                <p>No report data available yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyReport}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar
                      dataKey="expenses"
                      name="Monthly Expenses"
                      fill="#ef4444"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>Category-wise Spending Report</h3>
              <p>Understand where your money is going.</p>

              {categoryReport.length === 0 ? (
                <p>No expense data available yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <RechartsPieChart>
                    <Pie
                      data={categoryReport}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ category, percent }) =>
                        `${category} ${(percent * 100).toFixed(1)}%`
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>Income and Expense Report</h3>
              <p>Compare monthly income with expenses.</p>

              {monthlyReport.length === 0 ? (
                <p>No financial data available yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyReport}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar
                      dataKey="income"
                      name="Income"
                      fill="#16a34a"
                    />
                    <Bar
                      dataKey="expenses"
                      name="Expenses"
                      fill="#ef4444"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>Budget Variance Report</h3>
              <p>Compare actual spending with planned budgets.</p>

              {budgets.length === 0 ? (
                <p>Create a budget to view the variance report.</p>
              ) : (
                budgets.map((budget) => {
                  const variance =
                    Number(budget.amount) - Number(budget.spent);

                  return (
                    <div
                      className="transaction"
                      key={`${budget.category}-${budget.month}`}
                    >
                      <div>
                        <strong>{budget.category}</strong>
                        <p>{budget.month}</p>
                        <small>
                          Budget: {formatCurrency(budget.amount)} |
                          Spent: {formatCurrency(budget.spent)}
                        </small>
                      </div>

                      <strong
                        style={{
                          color: variance < 0 ? "#dc2626" : "#16a34a",
                        }}
                      >
                        {variance < 0
                          ? `${formatCurrency(Math.abs(variance))} over`
                          : `${formatCurrency(variance)} remaining`}
                      </strong>
                    </div>
                  );
                })
              )}
            </section>
          </>
        ) : activePage === "AI Insights" ? (
          /* AI INSIGHTS */
          <>
            <section className="summary-grid">
              <div className="summary-card">
                <p>Total Spending</p>
                <h2>{formatCurrency(totalExpenses)}</h2>
                <span>Across recorded transactions</span>
              </div>

              <div className="summary-card">
                <p>Highest Spending Category</p>
                <h2>{highestCategory?.category || "N/A"}</h2>
                <span>
                  {formatCurrency(highestCategory?.amount || 0)}
                </span>
              </div>

              <div className="summary-card">
                <p>Budget Usage</p>
                <h2>{budgetUsage.toFixed(1)}%</h2>
                <span>Across created budgets</span>
              </div>

              <div className="summary-card">
                <p>Potential Savings</p>
                <h2>
                  {formatCurrency(
                    Math.max(totalBudget - totalSpentBudget, 0)
                  )}
                </h2>
                <span>Remaining budget amount</span>
              </div>
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>
                <Sparkles size={20} /> AI Financial Insights
              </h3>

              <p>
                These insights are generated from your recorded financial
                data using rule-based analysis.
              </p>

              <div style={{ padding: "18px 0" }}>
                <h4>
                  <TrendingUp size={18} /> Spending Analysis
                </h4>

                {highestCategory ? (
                  <p>
                    Your highest spending category is{" "}
                    <strong>{highestCategory.category}</strong>, with
                    total spending of{" "}
                    <strong>
                      {formatCurrency(highestCategory.amount)}
                    </strong>.
                    Review this category to identify possible savings.
                  </p>
                ) : (
                  <p>Add expenses to receive spending analysis.</p>
                )}
              </div>

              <div style={{ padding: "18px 0" }}>
                <h4>
                  <AlertTriangle size={18} /> Budget Alerts
                </h4>

                {budgets.length === 0 ? (
                  <p>Create a monthly budget to receive budget alerts.</p>
                ) : (
                  budgets.map((budget) => (
                    <p key={`${budget.category}-${budget.month}`}>
                      {budget.percentage >= 100
                        ? `Warning: ${budget.category} budget exceeded!`
                        : budget.percentage >= 80
                        ? `Alert: ${budget.category} budget is nearly exhausted.`
                        : `${budget.category} spending is within budget.`}
                      {" "}({budget.percentage.toFixed(1)}% used)
                    </p>
                  ))
                )}
              </div>

              <div style={{ padding: "18px 0" }}>
                <h4>Saving Recommendations</h4>

                {totalExpenses > 0 ? (
                  <p>
                    Consider setting aside at least 10% of your income
                    for savings and reviewing recurring expenses.
                    Track your spending regularly to improve your
                    financial habits.
                  </p>
                ) : (
                  <p>
                    Record your income and expenses to receive
                    personalized saving suggestions.
                  </p>
                )}
              </div>
            </section>
          </>
        ) : activePage === "Settings" ? (
          /* SETTINGS */
          <>
            <section className="panel">
              <h3>
                <User size={20} /> Profile Settings
              </h3>

              <form
                className="transaction-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSuccess("Profile settings updated for this session.");
                }}
              >
                <label>Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      name: e.target.value,
                    })
                  }
                  required
                />

                <label>Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      email: e.target.value,
                    })
                  }
                />

                <label>
                  <IndianRupee size={16} /> Preferred Currency
                </label>

                <select
                  value={profile.currency}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      currency: e.target.value,
                    })
                  }
                >
                  <option value="INR">Indian Rupee (INR)</option>
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                </select>

                <button type="submit" className="add-button">
                  Save Settings
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginTop: "25px" }}>
              <h3>Application Information</h3>
              <p>Application: AI-Powered Personal Expense Tracker</p>
              <p>Frontend: React.js</p>
              <p>Backend: Python Flask</p>
              <p>Database: MongoDB</p>
              <p>Currency: {profile.currency}</p>
            </section>

          </>
        ) : null}
      </main>
    </div>
  );
}

export default App;