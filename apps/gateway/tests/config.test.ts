import { describe, expect, it } from 'vitest';
import { lanAddressScore, type LanAddress } from '../src/config.js';

const address = (interfaceName: string, ip: string): LanAddress => ({
  interfaceName,
  address: ip,
  family: 'IPv4',
});

describe('LAN address ranking', () => {
  it('prefers a physical Wi-Fi adapter over virtual adapters', () => {
    const wifi = address('Wi-Fi', '192.168.1.122');
    const wsl = address('vEthernet (WSL (Hyper-V firewall))', '192.168.192.1');
    const virtualBox = address('Ethernet 2', '192.168.56.1');

    expect(lanAddressScore(wifi)).toBeGreaterThan(lanAddressScore(wsl));
    expect(lanAddressScore(wifi)).toBeGreaterThan(lanAddressScore(virtualBox));
  });

  it('keeps physical Ethernet ahead of a hypervisor bridge', () => {
    const ethernet = address('Ethernet', '10.0.0.25');
    const bridge = address('vEthernet (Default Switch)', '172.20.16.1');

    expect(lanAddressScore(ethernet)).toBeGreaterThan(lanAddressScore(bridge));
  });

  it('still ranks a real adapter on a VirtualBox-style subnet below Wi-Fi', () => {
    const wifi = address('Wi-Fi', '192.168.1.50');
    const hostOnly = address('Ethernet 2', '192.168.56.1');

    expect(lanAddressScore(wifi)).toBeGreaterThan(lanAddressScore(hostOnly));
  });
});
