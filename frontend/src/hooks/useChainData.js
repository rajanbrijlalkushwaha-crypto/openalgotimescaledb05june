/**
 * useChainData(underlying)
 *
 * Subscribes to full option chain updates via Socket.io channel.
 * Chain is pushed every 10 seconds from the option-chain server.
 *
 * Returns:
 *   chain   → { underlying, expiry, spot_ltp, spot_pc, atm, options: [...] }
 *   connected → bool
 */

import { useEffect, useState } from 'react';
import sioClient from '../services/socketioClient';

export function useChainData(underlying) {
  const [chain,     setChain]     = useState(null);
  const [connected, setConnected] = useState(sioClient.connected);

  useEffect(() => sioClient.onConnectionChange(setConnected), []);

  useEffect(() => {
    if (!underlying) { setChain(null); return; }
    setChain(null);

    // Subscribe to chain room
    sioClient.socket?.emit('subscribe_chain', { underlying });

    const handler = (data) => {
      if (data?.underlying === underlying) setChain(data);
    };
    sioClient.socket?.on('chain', handler);

    return () => {
      sioClient.socket?.emit('unsubscribe_chain', { underlying });
      sioClient.socket?.off('chain', handler);
    };
  }, [underlying]);

  return { chain, connected };
}

export default useChainData;
