import React, { useState, useEffect, useRef, createContext, ReactNode, useContext } from 'react';
import supabase from '../lib/supabaseClient';

const PSYCHIC_URL = process.env.REACT_APP_PSYCHIC_URL


interface ModalContextType {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  customerLogoUrl: string;
  setCustomerLogoUrl: (url: string) => void;
  connectorName: string;
  setConnectorName: (name: string) => void;
  selectedConnectorId: string;
  setSelectedConnectorId: (id: string) => void;
  newConnection: any;
  setNewConnection: (connection: any) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string;
  setError: (error: string) => void;
  isSuccess: boolean;
  setIsSuccess: (success: boolean) => void;
  metadata: any;
  setMetadata: (metadata: any) => void;
  authCode: string;
  setAuthCode: (code: string) => void;
  credential: any;
  setCredential: (credential: any) => void;
  authCodeHandled: React.MutableRefObject<boolean>;
  accountId: string | null;
  publicKey: string | null;
  logoLoading: boolean;
  authorizeConnection: Function;
  startConnectorAuthFlow: Function;
}

export enum AuthMethod {
  OAUTH = 'oauth',
  API_KEY = 'api_key'
}
type OauthPayload = {
  connector_id: string;
  account_id: string;
  auth_code?: string;
  metadata?: string;
}

type ApiKeyPayload = {
  connector_id: string;
  account_id: string;
  credential?: any;
  metadata?: string;
}

// Create a context
const ModalContext = createContext<ModalContextType | null>(null);

interface ModalProviderProps {
  children: ReactNode;
}

// Custom provider component
const ModalProvider = ({ children }: ModalProviderProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerLogoUrl, setCustomerLogoUrl] = useState('');
  const [connectorName, setConnectorName] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [newConnection, setNewConnection] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [authCode, setAuthCode] = useState('');
  const [credential, setCredential] = useState(null);
  const [logoLoading, setLogoLoading] = useState(true);

  const authCodeHandled = useRef(false);

  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('account_id');
  const publicKey = urlParams.get('public_key');

  const value: ModalContextType = {
    currentStep,
    setCurrentStep,
    customerName,
    setCustomerName,
    customerLogoUrl,
    setCustomerLogoUrl,
    connectorName,
    setConnectorName,
    selectedConnectorId,
    setSelectedConnectorId,
    newConnection,
    setNewConnection,
    isLoading,
    setIsLoading,
    error,
    setError,
    isSuccess,
    setIsSuccess,
    metadata,
    setMetadata,
    authCode,
    setAuthCode,
    authCodeHandled,
    accountId,
    publicKey,
    logoLoading,
    authorizeConnection,
    startConnectorAuthFlow,
    credential,
    setCredential
  };

  useEffect(() => {
    if (accountId && publicKey) {
      // Get settings for public key and set the name and logo
      supabase
        .from('settings')
        .select('name, logo')
        .eq('app_id', publicKey)
        .then(({ data, error }) => {
          setLogoLoading(false);
          if (error) {
            setCustomerName('Support Hero');
            setCustomerLogoUrl('https://uploads-ssl.webflow.com/6401c72af7f8fc5af247a5c7/644d9f332d59bb5fbb0b60e3_Icon%20(3).png');
            console.log(error);
            return;
          }
          if (data && data.length > 0) {
            setCustomerName(data[0].name);
            setCustomerLogoUrl(data[0].logo);
          } else {
            setCustomerName('Support Hero');
            setCustomerLogoUrl('https://uploads-ssl.webflow.com/6401c72af7f8fc5af247a5c7/644d9f332d59bb5fbb0b60e3_Icon%20(3).png');
          }
        });
    }
  }, [accountId, publicKey]);

  async function authorizeConnection(
    connectorId: string, 
    accountId: string,
    publicKey: string,
    authCode?: string,
    metadata?: any,
    method?: AuthMethod,
    credential?: any
    ) {

    if (!method) {
      method = AuthMethod.OAUTH
    }
    
    const url = method == AuthMethod.OAUTH ? 
      PSYCHIC_URL + '/add-oauth-connection' : PSYCHIC_URL + '/add-apikey-connection';

    var payload: any = {
      account_id: accountId,
      connector_id: connectorId
    }
    if (method == AuthMethod.OAUTH && authCode) {
        payload.auth_code = authCode
    } else if (method == AuthMethod.API_KEY && credential) {
        payload.credential = credential
    }
    if (metadata) {
      payload.metadata = metadata
    }

    console.log(payload)
    console.log(url)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicKey}`},
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError('Something went wrong. Please try again.')
        setIsSuccess(false)
        setIsLoading(false)
        throw new Error(`Authorization failed with status: ${response.status}`);
      }

      const data = await response.json();

      return data.result;
    } catch (error) {
      setError('Something went wrong. Please try again.')
      setIsSuccess(false)
      setIsLoading(false)
      throw new Error(`Authorization failed with error: ${error}`);
    }
  }

  async function startConnectorAuthFlow(window: any, connectorId: string) {
    setIsLoading(true)
    console.log("hello")
    console.log(accountId)
    console.log(publicKey)
    if (!accountId || !publicKey) {
      setError('Invalid account_id or public_key')
      setIsLoading(false)
      return
    }
    
    const result = await authorizeConnection(connectorId, accountId, publicKey)
    const auth_url = result.auth_url
    console.log(result)
    // Open the auth url in a new window and center it.
    const width = window.innerWidth;
    const height = window.innerHeight;
    const left = window.screenX
    const top = window.screenY
    window.open(auth_url, '_blank', `addressbar=no, toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, width=${width}, height=${height}, top=${top}, left=${left}`)
  }

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

const useModalContext = (): ModalContextType => {
    const context = useContext(ModalContext);
    if (!context) {
      throw new Error('useModalContext must be used within an ModalProvider');
    }
    return context;
  };

export { ModalContext, ModalProvider, useModalContext };
