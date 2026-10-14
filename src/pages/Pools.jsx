import { useEffect, useMemo, useState } from "react";

import "../styles/Pools.css";

const STORAGE_KEY = "finance-pools-v1";

const CONTRIBUTION_TYPES = [
  {
    value: "skipped",
    label: "Skipped purchase",
  },
  {
    value: "discount",
    label: "Sale / discount",
  },
  {
    value: "cheaper",
    label: "Bought cheaper option",
  },
  {
    value: "refund",
    label: "Refund",
  },
  {
    value: "coupon",
    label: "Coupon / promo",
  },
  {
    value: "extra",
    label: "Extra money",
  },
  {
    value: "other",
    label: "Other",
  },
];

const createId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getTodayInputValue = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatMoney = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getContributionLabel = (type) => {
  return (
    CONTRIBUTION_TYPES.find((item) => item.value === type)?.label || "Other"
  );
};

const getPoolBalance = (pool) => {
  return (pool.contributions || []).reduce((total, contribution) => {
    return total + Number(contribution.remainingAmount || 0);
  }, 0);
};

const getPoolLifetimeSaved = (pool) => {
  return (pool.contributions || []).reduce((total, contribution) => {
    return total + Number(contribution.originalAmount || 0);
  }, 0);
};

const getPoolLifetimeSpent = (pool) => {
  return (pool.spending || []).reduce((total, transaction) => {
    return total + Number(transaction.amount || 0);
  }, 0);
};

const loadPools = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error("Could not load money pools:", error);
    return [];
  }
};

function Pools() {
  const [pools, setPools] = useState(loadPools);

  const [selectedPoolId, setSelectedPoolId] = useState(() => {
    const existing = loadPools();

    return existing[0]?.id || null;
  });

  const [showCreatePool, setShowCreatePool] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showSpendMoney, setShowSpendMoney] = useState(false);

  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolDescription, setNewPoolDescription] = useState("");

  const [contributionForm, setContributionForm] = useState({
    title: "",
    amount: "",
    type: "skipped",
    date: getTodayInputValue(),
    note: "",
  });

  const [spendForm, setSpendForm] = useState({
    title: "",
    amount: "",
    date: getTodayInputValue(),
    note: "",
  });

  const [activeTab, setActiveTab] = useState("money");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pools));
    } catch (error) {
      console.error("Could not save money pools:", error);
    }
  }, [pools]);

  useEffect(() => {
    if (!pools.length) {
      setSelectedPoolId(null);
      return;
    }

    const selectedStillExists = pools.some(
      (pool) => pool.id === selectedPoolId
    );

    if (!selectedStillExists) {
      setSelectedPoolId(pools[0].id);
    }
  }, [pools, selectedPoolId]);

  const selectedPool = useMemo(() => {
    return pools.find((pool) => pool.id === selectedPoolId) || null;
  }, [pools, selectedPoolId]);

  const totalAcrossPools = useMemo(() => {
    return pools.reduce((total, pool) => {
      return total + getPoolBalance(pool);
    }, 0);
  }, [pools]);

  const totalLifetimeSaved = useMemo(() => {
    return pools.reduce((total, pool) => {
      return total + getPoolLifetimeSaved(pool);
    }, 0);
  }, [pools]);

  const totalLifetimeSpent = useMemo(() => {
    return pools.reduce((total, pool) => {
      return total + getPoolLifetimeSpent(pool);
    }, 0);
  }, [pools]);

  const availableContributions = useMemo(() => {
    if (!selectedPool) {
      return [];
    }

    return [...(selectedPool.contributions || [])]
      .filter((item) => Number(item.remainingAmount) > 0)
      .sort((a, b) => {
        const aDate = new Date(`${a.date}T00:00:00`).getTime();
        const bDate = new Date(`${b.date}T00:00:00`).getTime();

        if (aDate !== bDate) {
          return aDate - bDate;
        }

        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      });
  }, [selectedPool]);

  const usedContributions = useMemo(() => {
    if (!selectedPool) {
      return [];
    }

    return [...(selectedPool.contributions || [])]
      .filter((item) => Number(item.remainingAmount) <= 0)
      .sort((a, b) => {
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      });
  }, [selectedPool]);

  const spendingHistory = useMemo(() => {
    if (!selectedPool) {
      return [];
    }

    return [...(selectedPool.spending || [])].sort((a, b) => {
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  }, [selectedPool]);

  const resetContributionForm = () => {
    setContributionForm({
      title: "",
      amount: "",
      type: "skipped",
      date: getTodayInputValue(),
      note: "",
    });
  };

  const resetSpendForm = () => {
    setSpendForm({
      title: "",
      amount: "",
      date: getTodayInputValue(),
      note: "",
    });
  };

  const handleCreatePool = (event) => {
    event.preventDefault();

    const name = newPoolName.trim();

    if (!name) {
      return;
    }

    const newPool = {
      id: createId(),
      name,
      description: newPoolDescription.trim(),
      createdAt: Date.now(),
      contributions: [],
      spending: [],
    };

    setPools((current) => [...current, newPool]);
    setSelectedPoolId(newPool.id);

    setNewPoolName("");
    setNewPoolDescription("");
    setShowCreatePool(false);
  };

  const handleDeletePool = () => {
    if (!selectedPool) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${selectedPool.name}"? This will remove its saved-money entries and spending history.`
    );

    if (!confirmed) {
      return;
    }

    setPools((current) =>
      current.filter((pool) => pool.id !== selectedPool.id)
    );
  };

  const handleAddContribution = (event) => {
    event.preventDefault();

    if (!selectedPool) {
      return;
    }

    const title = contributionForm.title.trim();
    const amount = Number(contributionForm.amount);

    if (!title || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const contribution = {
      id: createId(),
      title,
      type: contributionForm.type,
      originalAmount: amount,
      remainingAmount: amount,
      date: contributionForm.date || getTodayInputValue(),
      note: contributionForm.note.trim(),
      createdAt: Date.now(),
    };

    setPools((current) =>
      current.map((pool) => {
        if (pool.id !== selectedPool.id) {
          return pool;
        }

        return {
          ...pool,
          contributions: [...(pool.contributions || []), contribution],
        };
      })
    );

    resetContributionForm();
    setShowAddMoney(false);
  };

  const handleDeleteContribution = (contributionId) => {
    if (!selectedPool) {
      return;
    }

    const contribution = selectedPool.contributions.find(
      (item) => item.id === contributionId
    );

    if (!contribution) {
      return;
    }

    const amountUsed =
      Number(contribution.originalAmount) -
      Number(contribution.remainingAmount);

    if (amountUsed > 0) {
      window.alert(
        "This contribution has already funded spending and cannot be deleted."
      );
      return;
    }

    setPools((current) =>
      current.map((pool) => {
        if (pool.id !== selectedPool.id) {
          return pool;
        }

        return {
          ...pool,
          contributions: pool.contributions.filter(
            (item) => item.id !== contributionId
          ),
        };
      })
    );
  };

  const handleSpendFromPool = (event) => {
    event.preventDefault();

    if (!selectedPool) {
      return;
    }

    const title = spendForm.title.trim();
    const requestedAmount = Number(spendForm.amount);
    const availableBalance = getPoolBalance(selectedPool);

    if (
      !title ||
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return;
    }

    if (requestedAmount > availableBalance) {
      window.alert(
        `This pool only has ${formatMoney(
          availableBalance
        )} available.`
      );

      return;
    }

    let amountLeftToConsume = requestedAmount;

    const contributionCopies = (selectedPool.contributions || []).map(
      (contribution) => ({
        ...contribution,
      })
    );

    const sortedContributionIds = [...contributionCopies]
      .filter(
        (contribution) =>
          Number(contribution.remainingAmount) > 0
      )
      .sort((a, b) => {
        const aDate = new Date(`${a.date}T00:00:00`).getTime();
        const bDate = new Date(`${b.date}T00:00:00`).getTime();

        if (aDate !== bDate) {
          return aDate - bDate;
        }

        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      })
      .map((item) => item.id);

    const fundingSources = [];

    for (const contributionId of sortedContributionIds) {
      if (amountLeftToConsume <= 0) {
        break;
      }

      const contribution = contributionCopies.find(
        (item) => item.id === contributionId
      );

      if (!contribution) {
        continue;
      }

      const remainingAmount = Number(
        contribution.remainingAmount || 0
      );

      if (remainingAmount <= 0) {
        continue;
      }

      const consumedAmount = Math.min(
        remainingAmount,
        amountLeftToConsume
      );

      contribution.remainingAmount =
        remainingAmount - consumedAmount;

      amountLeftToConsume -= consumedAmount;

      fundingSources.push({
        contributionId: contribution.id,
        title: contribution.title,
        type: contribution.type,
        amount: consumedAmount,
      });
    }

    const spendingRecord = {
      id: createId(),
      title,
      amount: requestedAmount,
      date: spendForm.date || getTodayInputValue(),
      note: spendForm.note.trim(),
      fundingSources,
      createdAt: Date.now(),
    };

    setPools((current) =>
      current.map((pool) => {
        if (pool.id !== selectedPool.id) {
          return pool;
        }

        return {
          ...pool,
          contributions: contributionCopies,
          spending: [
            ...(pool.spending || []),
            spendingRecord,
          ],
        };
      })
    );

    resetSpendForm();
    setShowSpendMoney(false);
  };

  const handleUndoSpend = (spendingId) => {
    if (!selectedPool) {
      return;
    }

    const spendingRecord = selectedPool.spending.find(
      (item) => item.id === spendingId
    );

    if (!spendingRecord) {
      return;
    }

    const confirmed = window.confirm(
      `Undo "${spendingRecord.title}" and return ${formatMoney(
        spendingRecord.amount
      )} to this pool?`
    );

    if (!confirmed) {
      return;
    }

    setPools((current) =>
      current.map((pool) => {
        if (pool.id !== selectedPool.id) {
          return pool;
        }

        const contributions = pool.contributions.map(
          (contribution) => {
            const source = spendingRecord.fundingSources?.find(
              (fundingSource) =>
                fundingSource.contributionId === contribution.id
            );

            if (!source) {
              return contribution;
            }

            return {
              ...contribution,
              remainingAmount:
                Number(contribution.remainingAmount || 0) +
                Number(source.amount || 0),
            };
          }
        );

        return {
          ...pool,
          contributions,
          spending: pool.spending.filter(
            (item) => item.id !== spendingId
          ),
        };
      })
    );
  };

  return (
    <main className="pools-page">
      <div className="pools-shell">
        <header className="pools-page-header">
          <div>
            <p className="pools-eyebrow">POOLS</p>

            <h1>Give saved money somewhere to go.</h1>

            <p className="pools-page-description">
              Track the money you kept by skipping purchases,
              finding discounts, choosing cheaper options, getting
              refunds, and more. When you spend from a pool, you can
              see exactly which decisions paid for it.
            </p>
          </div>

          <button
            type="button"
            className="pools-primary-button"
            onClick={() => setShowCreatePool(true)}
          >
            <span className="pools-button-icon">+</span>
            New pool
          </button>
        </header>

        <section className="pools-summary-grid">
          <article className="pools-summary-card pools-summary-card-main">
            <span className="pools-summary-label">
              Available across pools
            </span>

            <strong className="pools-summary-value">
              {formatMoney(totalAcrossPools)}
            </strong>

            <span className="pools-summary-detail">
              Money your past decisions have left available.
            </span>
          </article>

          <article className="pools-summary-card">
            <span className="pools-summary-label">
              Lifetime added
            </span>

            <strong className="pools-summary-value-small">
              {formatMoney(totalLifetimeSaved)}
            </strong>

            <span className="pools-summary-detail">
              All money ever captured by your pools.
            </span>
          </article>

          <article className="pools-summary-card">
            <span className="pools-summary-label">
              Spent from pools
            </span>

            <strong className="pools-summary-value-small">
              {formatMoney(totalLifetimeSpent)}
            </strong>

            <span className="pools-summary-detail">
              Purchases funded using pooled money.
            </span>
          </article>

          <article className="pools-summary-card">
            <span className="pools-summary-label">
              Active pools
            </span>

            <strong className="pools-summary-value-small">
              {pools.length}
            </strong>

            <span className="pools-summary-detail">
              Separate buckets for different goals or purposes.
            </span>
          </article>
        </section>

        {pools.length === 0 ? (
          <section className="pools-empty-state">
            <div className="pools-empty-icon">
              <span>$</span>
            </div>

            <p className="pools-empty-eyebrow">
              START YOUR FIRST POOL
            </p>

            <h2>Turn little wins into something visible.</h2>

            <p>
              Skipped the $8 coffee? Saved $40 because something went
              on sale? Decided against a $70 impulse purchase? Put
              that money into a pool and keep track of what those
              decisions eventually pay for.
            </p>

            <button
              type="button"
              className="pools-primary-button"
              onClick={() => setShowCreatePool(true)}
            >
              Create your first pool
            </button>
          </section>
        ) : (
          <div className="pools-layout">
            <aside className="pools-sidebar">
              <div className="pools-sidebar-heading">
                <span>Your pools</span>

                <button
                  type="button"
                  className="pools-icon-button"
                  onClick={() => setShowCreatePool(true)}
                  aria-label="Create a pool"
                >
                  +
                </button>
              </div>

              <div className="pools-pool-list">
                {pools.map((pool) => {
                  const balance = getPoolBalance(pool);

                  return (
                    <button
                      type="button"
                      key={pool.id}
                      className={`pools-pool-option ${
                        pool.id === selectedPoolId
                          ? "is-active"
                          : ""
                      }`}
                      onClick={() => setSelectedPoolId(pool.id)}
                    >
                      <span className="pools-pool-option-icon">
                        $
                      </span>

                      <span className="pools-pool-option-content">
                        <span className="pools-pool-option-name">
                          {pool.name}
                        </span>

                        <span className="pools-pool-option-balance">
                          {formatMoney(balance)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {selectedPool && (
              <section className="pools-detail">
                <div className="pools-detail-header">
                  <div>
                    <p className="pools-detail-label">
                      MONEY POOL
                    </p>

                    <h2>{selectedPool.name}</h2>

                    {selectedPool.description && (
                      <p className="pools-detail-description">
                        {selectedPool.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="pools-delete-pool-button"
                    onClick={handleDeletePool}
                  >
                    Delete pool
                  </button>
                </div>

                <div className="pools-balance-card">
                  <div>
                    <span className="pools-balance-label">
                      Available
                    </span>

                    <div className="pools-balance">
                      {formatMoney(getPoolBalance(selectedPool))}
                    </div>

                    <p>
                      Built from{" "}
                      <strong>
                        {
                          availableContributions.filter(
                            (item) =>
                              Number(item.remainingAmount) > 0
                          ).length
                        }
                      </strong>{" "}
                      currently available money sources.
                    </p>
                  </div>

                  <div className="pools-balance-actions">
                    <button
                      type="button"
                      className="pools-add-button"
                      onClick={() => setShowAddMoney(true)}
                    >
                      <span>+</span>
                      Add saved money
                    </button>

                    <button
                      type="button"
                      className="pools-spend-button"
                      disabled={
                        getPoolBalance(selectedPool) <= 0
                      }
                      onClick={() => setShowSpendMoney(true)}
                    >
                      Spend from pool
                    </button>
                  </div>
                </div>

                <div className="pools-tabs">
                  <button
                    type="button"
                    className={
                      activeTab === "money" ? "is-active" : ""
                    }
                    onClick={() => setActiveTab("money")}
                  >
                    What makes up this pool
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab === "spending" ? "is-active" : ""
                    }
                    onClick={() => setActiveTab("spending")}
                  >
                    Spending history
                  </button>
                </div>

                {activeTab === "money" && (
                  <div className="pools-tab-content">
                    <div className="pools-section-heading">
                      <div>
                        <h3>Available money</h3>

                        <p>
                          Every dollar in the pool keeps a record of
                          where it came from.
                        </p>
                      </div>

                      <span>
                        {availableContributions.length}{" "}
                        {availableContributions.length === 1
                          ? "source"
                          : "sources"}
                      </span>
                    </div>

                    {availableContributions.length === 0 ? (
                      <div className="pools-inner-empty">
                        <div className="pools-inner-empty-icon">
                          +
                        </div>

                        <h4>Nothing in this pool yet.</h4>

                        <p>
                          Add money the next time you skip a purchase,
                          get a discount, receive a refund, or
                          otherwise save money.
                        </p>

                        <button
                          type="button"
                          onClick={() => setShowAddMoney(true)}
                        >
                          Add saved money
                        </button>
                      </div>
                    ) : (
                      <div className="pools-source-list">
                        {availableContributions.map(
                          (contribution) => {
                            const originalAmount = Number(
                              contribution.originalAmount || 0
                            );

                            const remainingAmount = Number(
                              contribution.remainingAmount || 0
                            );

                            const amountUsed =
                              originalAmount - remainingAmount;

                            const percentRemaining =
                              originalAmount > 0
                                ? Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      (remainingAmount /
                                        originalAmount) *
                                        100
                                    )
                                  )
                                : 0;

                            return (
                              <article
                                key={contribution.id}
                                className="pools-source-card"
                              >
                                <div className="pools-source-card-top">
                                  <div className="pools-source-icon">
                                    {contribution.type ===
                                    "discount"
                                      ? "%"
                                      : contribution.type ===
                                        "refund"
                                      ? "↩"
                                      : contribution.type ===
                                        "skipped"
                                      ? "×"
                                      : "$"}
                                  </div>

                                  <div className="pools-source-main">
                                    <div className="pools-source-title-row">
                                      <div>
                                        <h4>
                                          {contribution.title}
                                        </h4>

                                        <div className="pools-source-meta">
                                          <span className="pools-source-type">
                                            {getContributionLabel(
                                              contribution.type
                                            )}
                                          </span>

                                          <span>
                                            {formatDate(
                                              contribution.date
                                            )}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="pools-source-money">
                                        <strong>
                                          {formatMoney(
                                            remainingAmount
                                          )}
                                        </strong>

                                        {amountUsed > 0 && (
                                          <span>
                                            of{" "}
                                            {formatMoney(
                                              originalAmount
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {contribution.note && (
                                      <p className="pools-source-note">
                                        {contribution.note}
                                      </p>
                                    )}

                                    {amountUsed > 0 && (
                                      <div className="pools-source-progress">
                                        <div className="pools-progress-track">
                                          <div
                                            className="pools-progress-fill"
                                            style={{
                                              width: `${percentRemaining}%`,
                                            }}
                                          />
                                        </div>

                                        <div className="pools-progress-details">
                                          <span>
                                            {formatMoney(
                                              remainingAmount
                                            )}{" "}
                                            remaining
                                          </span>

                                          <span>
                                            {formatMoney(amountUsed)}{" "}
                                            already used
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="pools-source-delete"
                                    onClick={() =>
                                      handleDeleteContribution(
                                        contribution.id
                                      )
                                    }
                                    aria-label={`Delete ${contribution.title}`}
                                  >
                                    ×
                                  </button>
                                </div>
                              </article>
                            );
                          }
                        )}
                      </div>
                    )}

                    {usedContributions.length > 0 && (
                      <div className="pools-used-section">
                        <div className="pools-section-heading">
                          <div>
                            <h3>Fully used</h3>

                            <p>
                              Money sources that have completely
                              funded later purchases.
                            </p>
                          </div>
                        </div>

                        <div className="pools-used-list">
                          {usedContributions.map(
                            (contribution) => (
                              <div
                                key={contribution.id}
                                className="pools-used-row"
                              >
                                <div>
                                  <strong>
                                    {contribution.title}
                                  </strong>

                                  <span>
                                    {getContributionLabel(
                                      contribution.type
                                    )}{" "}
                                    ·{" "}
                                    {formatDate(
                                      contribution.date
                                    )}
                                  </span>
                                </div>

                                <div className="pools-used-amount">
                                  <span>
                                    {formatMoney(
                                      contribution.originalAmount
                                    )}
                                  </span>

                                  <small>fully used</small>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "spending" && (
                  <div className="pools-tab-content">
                    <div className="pools-section-heading">
                      <div>
                        <h3>What this pool paid for</h3>

                        <p>
                          Each purchase shows the saved-money
                          decisions that funded it.
                        </p>
                      </div>

                      <span>
                        {spendingHistory.length}{" "}
                        {spendingHistory.length === 1
                          ? "purchase"
                          : "purchases"}
                      </span>
                    </div>

                    {spendingHistory.length === 0 ? (
                      <div className="pools-inner-empty">
                        <div className="pools-inner-empty-icon">
                          $
                        </div>

                        <h4>No pool spending yet.</h4>

                        <p>
                          When you buy something using this pool,
                          you&apos;ll be able to see exactly which
                          savings funded it.
                        </p>
                      </div>
                    ) : (
                      <div className="pools-spending-list">
                        {spendingHistory.map((transaction) => (
                          <article
                            key={transaction.id}
                            className="pools-spending-card"
                          >
                            <div className="pools-spending-header">
                              <div>
                                <span className="pools-spending-date">
                                  {formatDate(transaction.date)}
                                </span>

                                <h4>{transaction.title}</h4>

                                {transaction.note && (
                                  <p>{transaction.note}</p>
                                )}
                              </div>

                              <div className="pools-spending-amount">
                                -{formatMoney(transaction.amount)}
                              </div>
                            </div>

                            <div className="pools-funded-by">
                              <span className="pools-funded-label">
                                Funded by
                              </span>

                              <div className="pools-funding-list">
                                {transaction.fundingSources?.map(
                                  (source, index) => (
                                    <div
                                      className="pools-funding-row"
                                      key={`${transaction.id}-${source.contributionId}-${index}`}
                                    >
                                      <div>
                                        <span className="pools-funding-dot" />

                                        <span>
                                          {source.title}
                                        </span>
                                      </div>

                                      <strong>
                                        {formatMoney(source.amount)}
                                      </strong>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>

                            <div className="pools-spending-footer">
                              <span>
                                Recorded{" "}
                                {formatDateTime(
                                  transaction.createdAt
                                )}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  handleUndoSpend(transaction.id)
                                }
                              >
                                Undo spending
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {showCreatePool && (
        <div
          className="pools-modal-backdrop"
          onMouseDown={() => setShowCreatePool(false)}
        >
          <div
            className="pools-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pools-modal-heading">
              <div>
                <p>NEW POOL</p>
                <h2>Create a money pool</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowCreatePool(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="pools-modal-description">
              Pools can represent anything you want: guilt-free
              spending, travel, tech, eating out, hobbies, or simply
              money you saved by making better decisions.
            </p>

            <form onSubmit={handleCreatePool}>
              <label className="pools-field">
                <span>Pool name</span>

                <input
                  type="text"
                  value={newPoolName}
                  onChange={(event) =>
                    setNewPoolName(event.target.value)
                  }
                  placeholder="e.g. Fun Money"
                  autoFocus
                />
              </label>

              <label className="pools-field">
                <span>Description</span>

                <textarea
                  value={newPoolDescription}
                  onChange={(event) =>
                    setNewPoolDescription(event.target.value)
                  }
                  placeholder="What is this money for?"
                  rows={3}
                />
              </label>

              <div className="pools-modal-actions">
                <button
                  type="button"
                  className="pools-secondary-button"
                  onClick={() => setShowCreatePool(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="pools-primary-button"
                  disabled={!newPoolName.trim()}
                >
                  Create pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMoney && selectedPool && (
        <div
          className="pools-modal-backdrop"
          onMouseDown={() => setShowAddMoney(false)}
        >
          <div
            className="pools-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pools-modal-heading">
              <div>
                <p>ADD TO {selectedPool.name.toUpperCase()}</p>
                <h2>Where did you save money?</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowAddMoney(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="pools-modal-description">
              Capture the decision that left this money in your
              pocket.
            </p>

            <form onSubmit={handleAddContribution}>
              <div className="pools-field-grid">
                <label className="pools-field pools-field-wide">
                  <span>What happened?</span>

                  <input
                    type="text"
                    value={contributionForm.title}
                    onChange={(event) =>
                      setContributionForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="e.g. Didn't order DoorDash"
                    autoFocus
                  />
                </label>

                <label className="pools-field">
                  <span>Amount saved</span>

                  <div className="pools-money-input">
                    <span>$</span>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={contributionForm.amount}
                      onChange={(event) =>
                        setContributionForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </label>

                <label className="pools-field">
                  <span>Type</span>

                  <select
                    value={contributionForm.type}
                    onChange={(event) =>
                      setContributionForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                  >
                    {CONTRIBUTION_TYPES.map((type) => (
                      <option
                        key={type.value}
                        value={type.value}
                      >
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="pools-field">
                  <span>Date</span>

                  <input
                    type="date"
                    value={contributionForm.date}
                    onChange={(event) =>
                      setContributionForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="pools-field pools-field-wide">
                  <span>
                    Note{" "}
                    <small>optional</small>
                  </span>

                  <textarea
                    rows={3}
                    value={contributionForm.note}
                    onChange={(event) =>
                      setContributionForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    placeholder="Anything you want to remember about this decision."
                  />
                </label>
              </div>

              <div className="pools-modal-actions">
                <button
                  type="button"
                  className="pools-secondary-button"
                  onClick={() => setShowAddMoney(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="pools-primary-button"
                  disabled={
                    !contributionForm.title.trim() ||
                    !contributionForm.amount ||
                    Number(contributionForm.amount) <= 0
                  }
                >
                  Add to pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSpendMoney && selectedPool && (
        <div
          className="pools-modal-backdrop"
          onMouseDown={() => setShowSpendMoney(false)}
        >
          <div
            className="pools-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pools-modal-heading">
              <div>
                <p>SPEND FROM {selectedPool.name.toUpperCase()}</p>
                <h2>Use money from this pool</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowSpendMoney(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="pools-spend-available">
              <span>Available to spend</span>

              <strong>
                {formatMoney(getPoolBalance(selectedPool))}
              </strong>
            </div>

            <form onSubmit={handleSpendFromPool}>
              <div className="pools-field-grid">
                <label className="pools-field pools-field-wide">
                  <span>What did you buy?</span>

                  <input
                    type="text"
                    value={spendForm.title}
                    onChange={(event) =>
                      setSpendForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="e.g. New headphones"
                    autoFocus
                  />
                </label>

                <label className="pools-field">
                  <span>Purchase amount</span>

                  <div className="pools-money-input">
                    <span>$</span>

                    <input
                      type="number"
                      min="0"
                      max={getPoolBalance(selectedPool)}
                      step="0.01"
                      inputMode="decimal"
                      value={spendForm.amount}
                      onChange={(event) =>
                        setSpendForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </label>

                <label className="pools-field">
                  <span>Date</span>

                  <input
                    type="date"
                    value={spendForm.date}
                    onChange={(event) =>
                      setSpendForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="pools-field pools-field-wide">
                  <span>
                    Note <small>optional</small>
                  </span>

                  <textarea
                    rows={3}
                    value={spendForm.note}
                    onChange={(event) =>
                      setSpendForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    placeholder="Why did you decide to use the pool for this?"
                  />
                </label>
              </div>

              {Number(spendForm.amount) > 0 &&
                Number(spendForm.amount) <=
                  getPoolBalance(selectedPool) && (
                  <div className="pools-spend-preview">
                    <span>After this purchase</span>

                    <div>
                      <strong>
                        {formatMoney(
                          getPoolBalance(selectedPool) -
                            Number(spendForm.amount)
                        )}
                      </strong>

                      <small>
                        will remain in {selectedPool.name}
                      </small>
                    </div>
                  </div>
                )}

              <div className="pools-consumption-note">
                <strong>How funding is chosen</strong>

                <p>
                  This purchase will use the oldest available money
                  in this pool first. If only part of a saved-money
                  entry is needed, the remainder stays available.
                </p>
              </div>

              <div className="pools-modal-actions">
                <button
                  type="button"
                  className="pools-secondary-button"
                  onClick={() => setShowSpendMoney(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="pools-primary-button"
                  disabled={
                    !spendForm.title.trim() ||
                    !spendForm.amount ||
                    Number(spendForm.amount) <= 0 ||
                    Number(spendForm.amount) >
                      getPoolBalance(selectedPool)
                  }
                >
                  Spend from pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default Pools;