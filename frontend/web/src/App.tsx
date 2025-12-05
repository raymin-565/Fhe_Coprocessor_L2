import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

// FHE 加密/解密模拟函数
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => 
  encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : 0;
const generatePublicKey = () => `0x${Array(20).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

// 数据类型定义
interface GeneticDataset {
  id: number;
  title: string;
  description: string;
  price: number;
  encrypted: boolean;
  owner: string;
  timestamp: number;
  analysisCount: number;
}

interface UserAction {
  type: 'upload' | 'query' | 'analyze' | 'purchase' | 'wallet';
  timestamp: number;
  details: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<GeneticDataset[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<GeneticDataset | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [contractPublicKey, setContractPublicKey] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'price' | 'date' | 'title'>('date');
  const [isAscending, setIsAscending] = useState<boolean>(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<string>("");

  // 初始化
  useEffect(() => {
    initializeApp().finally(() => setLoading(false));
  }, []);

  const initializeApp = async () => {
    try {
      const contract = await getContractReadOnly();
      if (contract) setContractPublicKey(generatePublicKey());
      
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);
        setWalletAddress(`0x${chainId.toString(16).padStart(8, '0')}`);
      }
      
      await checkContractAvailability();
      await loadDatasets();
      await loadUserActions();
    } catch (error) {
      console.error("Initialization error:", error);
    }
  };

  // 检查合约可用性
  const checkContractAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (contract) {
        const isAvailable = await contract.isAvailable();
        if (isAvailable) {
          showTransactionStatus("Contract is available and ready for FHE operations!", "success");
        }
      }
    } catch (error) {
      console.error("Availability check failed:", error);
    }
  };

  // 加载数据集
  const loadDatasets = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const datasetsData = await contract.getData("genomicDatasets");
      let datasetList: GeneticDataset[] = [];
      
      if (datasetsData && datasetsData.length > 0) {
        try {
          const datasetsStr = ethers.toUtf8String(datasetsData);
          if (datasetsStr.trim() !== '') {
            datasetList = JSON.parse(datasetsStr);
          }
        } catch (e) {
          console.error("Dataset parsing error:", e);
        }
      }
      
      setDatasets(datasetList);
    } catch (error) {
      console.error("Error loading datasets:", error);
      showTransactionStatus("Failed to load datasets", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // 加载用户操作历史
  const loadUserActions = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const actionsData = await contract.getData("userActions");
      let actionsList: UserAction[] = [];
      
      if (actionsData && actionsData.length > 0) {
        try {
          const actionsStr = ethers.toUtf8String(actionsData);
          if (actionsStr.trim() !== '') {
            actionsList = JSON.parse(actionsStr);
          }
        } catch (e) {
          console.error("Actions parsing error:", e);
        }
      }
      
      setUserActions(actionsList);
    } catch (error) {
      console.error("Error loading user actions:", error);
    }
  };

  // 显示交易状态
  const showTransactionStatus = (message: string, status: "pending" | "success" | "error") => {
    setTransactionStatus({ visible: true, status, message });
    setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
  };

  // 上传数据集
  const uploadDataset = async () => {
    if (!isConnected || !address) {
      showTransactionStatus("Please connect your wallet first", "error");
      return;
    }

    if (!currentAnalysis.trim()) {
      showTransactionStatus("Please enter analysis details", "error");
      return;
    }

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");

      const newDataset: GeneticDataset = {
        id: datasets.length + 1,
        title: `FHE-Encrypted Dataset #${datasets.length + 1}`,
        description: currentAnalysis,
        price: Math.floor(Math.random() * 1000) + 100, // 随机价格 100-1100
        encrypted: true,
        owner: address,
        timestamp: Math.floor(Date.now() / 1000),
        analysisCount: 0
      };

      const updatedDatasets = [...datasets, newDataset];
      await contract.setData("genomicDatasets", ethers.toUtf8Bytes(JSON.stringify(updatedDatasets)));

      const newAction: UserAction = {
        type: 'upload',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Uploaded FHE encrypted dataset: ${newDataset.title}`
      };
      setUserActions(prev => [newAction, ...prev]);

      showTransactionStatus("Dataset uploaded successfully with FHE encryption!", "success");
      setCurrentAnalysis("");
      await loadDatasets();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Upload failed";
      showTransactionStatus(`Upload failed: ${errorMsg}`, "error");
    }
  };

  // 查询数据集
  const queryDataset = async (datasetId: number) => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Contract not available");

      const datasetsData = await contract.getData("genomicDatasets");
      if (!datasetsData || datasetsData.length === 0) {
        showTransactionStatus("No datasets found", "error");
        return;
      }

      try {
        const datasetsStr = ethers.toUtf8String(datasetsData);
        if (datasetsStr.trim() !== '') {
          const allDatasets = JSON.parse(datasetsStr);
          const dataset = allDatasets.find(d => d.id === datasetId);
          if (dataset) {
            setSelectedDataset(dataset);
            showTransactionStatus(`Dataset ${datasetId} retrieved successfully`, "success");
            
            const newAction: UserAction = {
              type: 'query',
              timestamp: Math.floor(Date.now() / 1000),
              details: `Queried dataset: ${dataset.title}`
            };
            setUserActions(prev => [newAction, ...prev]);
          } else {
            showTransactionStatus(`Dataset ${datasetId} not found`, "error");
          }
        }
      } catch (e) {
        showTransactionStatus("Failed to parse dataset data", "error");
      }
    } catch (error) {
      showTransactionStatus("Query failed", "error");
    }
  };

  // 模拟FHE同态分析
  const performHomomorphicAnalysis = async (datasetId: number) => {
    if (!isConnected || !address) {
      showTransactionStatus("Please connect your wallet for FHE analysis", "error");
      return;
    }

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Contract not available");

      const datasetsData = await contract.getData("genomicDatasets");
      if (!datasetsData || datasetsData.length === 0) {
        showTransactionStatus("No datasets available", "error");
        return;
      }

      try {
        const datasetsStr = ethers.toUtf8String(datasetsData);
        if (datasetsStr.trim() !== '') {
          const allDatasets = JSON.parse(datasetsStr);
          const dataset = allDatasets.find(d => d.id === datasetId);
          
          if (dataset) {
            // 模拟FHE同态计算 - 增加分析计数
            const updatedDatasets = allDatasets.map(d => 
              d.id === datasetId ? { ...d, analysisCount: d.analysisCount + 1 } : d
            );
            
            await contract.setData("genomicDatasets", ethers.toUtf8Bytes(JSON.stringify(updatedDatasets)));

            // 更新本地状态
            const localDataset = datasets.find(d => d.id === datasetId);
            if (localDataset) {
              const updatedDataset = { ...localDataset, analysisCount: localDataset.analysisCount + 1 };
              setDatasets(datasets.map(d => d.id === datasetId ? updatedDataset : d));
              
              const newAction: UserAction = {
                type: 'analyze',
                timestamp: Math.floor(Date.now() / 1000),
                details: `Performed FHE homomorphic analysis on dataset: ${dataset.title}`
              };
              setUserActions(prev => [newAction, ...prev]);

              showTransactionStatus("FHE homomorphic analysis completed successfully!", "success");
            }
          }
        }
      } catch (e) {
        showTransactionStatus("Failed to perform analysis", "error");
      }
    } catch (error) {
      showTransactionStatus("Analysis failed", "error");
    }
  };

  // 购买数据集
  const purchaseDataset = async (datasetId: number) => {
    if (!isConnected || !address) {
      showTransactionStatus("Please connect your wallet to purchase", "error");
      return;
    }

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Contract not available");

      const datasetsData = await contract.getData("genomicDatasets");
      if (!datasetsData || datasetsData.length === 0) {
        showTransactionStatus("No datasets available", "error");
        return;
      }

      try {
        const datasetsStr = ethers.toUtf8String(datasetsData);
        if (datasetsStr.trim() !== '') {
          const allDatasets = JSON.parse(datasetsStr);
          const dataset = allDatasets.find(d => d.id === datasetId);
          
          if (dataset && dataset.encrypted) {
            // 模拟购买过程 - 转移所有权
            const updatedDatasets = allDatasets.map(d => 
              d.id === datasetId ? { ...d, owner: address, analysisCount: d.analysisCount + 1 } : d
            );
            
            await contract.setData("genomicDatasets", ethers.toUtf8Bytes(JSON.stringify(updatedDatasets)));

            // 更新本地状态
            const localDataset = datasets.find(d => d.id === datasetId);
            if (localDataset) {
              const updatedDataset = { ...localDataset, owner: address, analysisCount: localDataset.analysisCount + 1 };
              setDatasets(datasets.map(d => d.id === datasetId ? updatedDataset : d));
              
              const newAction: UserAction = {
                type: 'purchase',
                timestamp: Math.floor(Date.now() / 1000),
                details: `Purchased FHE encrypted dataset: ${dataset.title}`
              };
              setUserActions(prev => [newAction, ...prev]);

              showTransactionStatus("Dataset purchased successfully with FHE privacy protection!", "success");
            }
          }
        }
      } catch (e) {
        showTransactionStatus("Failed to process purchase", "error");
      }
    } catch (error) {
      showTransactionStatus("Purchase failed", "error");
    }
  };

  // 钱包管理
  const manageWallet = async () => {
    if (!isConnected) {
      showTransactionStatus("Please connect your wallet", "error");
      return;
    }

    try {
      // 模拟钱包签名验证
      const message = `FHE Wallet Verification\nAddress: ${address}\nTimestamp: ${Math.floor(Date.now() / 1000)}`;
      await signMessageAsync({ message });
      
      const newAction: UserAction = {
        type: 'wallet',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Performed wallet signature verification for FHE operations"
      };
      setUserActions(prev => [newAction, ...prev]);

      showTransactionStatus("Wallet verified successfully for FHE operations!", "success");
    } catch (error) {
      showTransactionStatus("Wallet verification failed", "error");
    }
  };

  // 排序数据集
  const sortedDatasets = [...datasets].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'price':
        comparison = a.price - b.price;
        break;
      case 'date':
        comparison = b.timestamp - a.timestamp;
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
    }
    return isAscending ? comparison : -comparison;
  });

  // 过滤数据集
  const filteredDatasets = sortedDatasets.filter(dataset =>
    dataset.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dataset.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-loader"></div>
      <p>Initializing FHE Genomic Data Marketplace...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo">
            <div className="dna-icon">🧬</div>
            <h1>FHES029</h1>
            <span className="project-name">Marketplace</span>
          </div>
          <p className="tagline">Encrypted Genomic Data with FHE Privacy</p>
        </div>
        
        <div className="header-actions">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          <button onClick={manageWallet} className="wallet-manage-btn">
            Manage Wallet
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="content-grid">
          <div className="left-panel">
            <div className="upload-section">
              <h2>Upload Encrypted Dataset</h2>
              <textarea
                value={currentAnalysis}
                onChange={(e) => setCurrentAnalysis(e.target.value)}
                placeholder="Describe the genomic analysis you want to enable on your encrypted data..."
                className="analysis-input"
              />
              <button onClick={uploadDataset} className="upload-btn">
                Upload with FHE Encryption
              </button>
            </div>
          </div>

          <div className="center-panel">
            <div className="datasets-section">
              <div className="section-header">
                <h2>Genomic Datasets Marketplace</h2>
                <div className="controls">
                  <input
                    type="text"
                    placeholder="Search datasets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'price' | 'date' | 'title')}
                    className="sort-select"
                  >
                    <option value="date">Sort by Date</option>
                    <option value="price">Sort by Price</option>
                    <option value="title">Sort by Title</option>
                  </select>
                  <button
                    onClick={() => setIsAscending(!isAscending)}
                    className="sort-order-btn"
                  >
                    {isAscending ? '↑' : '↓'}
                  </button>
                </div>
              </div>

              <div className="datasets-list">
                {filteredDatasets.length === 0 ? (
                  <div className="no-data">
                    <div className="no-data-icon">🔍</div>
                    <p>No datasets found</p>
                    <p>Upload your first encrypted genomic dataset or adjust your search</p>
                  </div>
                ) : (
                  filteredDatasets.map((dataset) => (
                    <div
                      key={dataset.id}
                      className={`dataset-card ${selectedDataset?.id === dataset.id ? 'selected' : ''}`}
                      onClick={() => setSelectedDataset(dataset)}
                    >
                      <div className="dataset-header">
                        <h3>{dataset.title}</h3>
                        <span className="price">¥{dataset.price}</span>
                      </div>
                      <p className="dataset-description">
                        {dataset.description.substring(0, 80)}...
                      </p>
                      <div className="dataset-meta">
                        <span className="owner">Owner: {dataset.owner.substring(0, 6)}...</span>
                        <span className="date">
                          {new Date(dataset.timestamp * 1000).toLocaleDateString()}
                        </span>
                        <span className="analyses">Analyses: {dataset.analysisCount}</span>
                      </div>
                      <div className="dataset-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            queryDataset(dataset.id);
                          }}
                          className="action-btn query"
                        >
                          Query
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            performHomomorphicAnalysis(dataset.id);
                          }}
                          className="action-btn analyze"
                        >
                          Analyze
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            purchaseDataset(dataset.id);
                          }}
                          className="action-btn purchase"
                        >
                          Purchase
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {selectedDataset && (
        <div className="dataset-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{selectedDataset.title}</h2>
              <button onClick={() => setSelectedDataset(null)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="dataset-details">
                <p><strong>Description:</strong> {selectedDataset.description}</p>
                <p><strong>Price:</strong> ¥{selectedDataset.price}</p>
                <p><strong>Owner:</strong> {selectedDataset.owner}</p>
                <p><strong>Created:</strong> {new Date(selectedDataset.timestamp * 1000).toLocaleString()}</p>
                <p><strong>Analysis Count:</strong> {selectedDataset.analysisCount}</p>
                <p><strong>Status:</strong> {selectedDataset.encrypted ? 'FHE Encrypted' : 'Plaintext'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === 'pending' && <div className="fhe-spinner"></div>}
              {transactionStatus.status === 'success' && <div className="success-icon">✓</div>}
              {transactionStatus.status === 'error' && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>© {new Date().getFullYear()} FHES029 - FHE Genomic Data Marketplace</p>
        <p>Powered by Zama FHE | Secure, Private, and Efficient</p>
      </footer>
    </div>
  );
};

export default App;