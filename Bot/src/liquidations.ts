import IconAmount from "icon-sdk-js/build/data/Amount";
import { Position } from "./position";
import IconService, { HttpProvider, CallTransactionBuilder, Wallet, SignedTransaction, CallBuilder, Converter} from 'icon-sdk-js';


export class Liquidations {
    private collaterals: Map<String, String> = new Map();
    private positions: Map<string,  Array<Position>> = new Map();
    private provider:HttpProvider;
    private iconService: IconService;
    private wallet: Wallet;
    private loans: string;
    private bnUSD: string;
    private oracle: string;
    private autoLiquidator: string;
    private nid: string;

    constructor(config: any) {
        this.provider = new HttpProvider(config.icon_url);
        this.iconService = new IconService(this.provider);
        this.wallet = Wallet.loadPrivateKey(config.icon_pk);
        this.loans = config.loans;
        this.bnUSD = config.bnUSD;
        this.oracle = config.oracle;
        this.nid = config.nid;
        this.autoLiquidator = config.auto_liquidator
    }

    private async defaultLiquidate(address:string, symbol:string): Promise<boolean> {
        const timestamp = (new Date()).getTime() * 1000;
        let balance = await this.getBnUSDBalance();
        if (parseInt(balance, 16) <= 0) {
            return false
        }

        // liquidate with full balanced, Only amount needed will be deducted
        let tx = new CallTransactionBuilder()
            .nid(this.nid)
            .from(this.wallet.getAddress())
            .stepLimit(400000000)
            .timestamp(timestamp)
            .to(this.loans)
            .method("liquidate")
            .params({
                "_owner": address,
                "_amount": balance,
                "_collateralSymbol": symbol
            })
            .version("0x3")
            .build();

        const signedTransaction: SignedTransaction = new SignedTransaction(tx, this.wallet);
        const txHash = await this.iconService.sendTransaction(signedTransaction).execute();
        const transactionResult = await this.getTxResult(txHash);
        return transactionResult.status === 1
    }

    private async liquidateAndSwap(address:string, symbol:string) {
        const timestamp = (new Date()).getTime() * 1000;
        let balance = await this.getBnUSDBalance();
        if (parseInt(balance, 16) <= 0) {
            return false
        }

        // liquidate with full balanced, Only amount needed will be deducted
        let tx = new CallTransactionBuilder()
            .nid(this.nid)
            .from(this.wallet.getAddress())
            .stepLimit(400000000)
            .timestamp(timestamp)
            .to(this.bnUSD)
            .method("transfer")
            .params({
                "_to": this.autoLiquidator,
                "_value": balance,
                "_data": Converter.toHex(JSON.stringify({"address": address, "symbol": symbol}))
            })
            .version("0x3")
            .build();

        const signedTransaction: SignedTransaction = new SignedTransaction(tx, this.wallet);
        const txHash = await this.iconService.sendTransaction(signedTransaction).execute();
        const transactionResult = await this.getTxResult(txHash);
        return transactionResult.status === 1
    }

    public async check(): Promise<void> {
        for (const [symbol, positions] of this.positions) {
            let price = await this.getPrice(symbol);
            // Iterate through the positions in reverse order to safely remove elements
            for (let i = positions.length - 1; i >= 0; i--) {
                let pos = positions[i];
                console.log(symbol + " price: " + price / 10**18, pos.liquidationPrice / 10**18);
                if (pos.liquidationPrice < price) {
                    // exit since list is sorted
                    break;
                }

                let liquidate;
                if (this.autoLiquidator != "" || this.autoLiquidator == null) {
                    liquidate = this.liquidateAndSwap(pos.address, symbol);
                } else {
                    liquidate = this.defaultLiquidate(pos.address, symbol)
                }

                if (await liquidate) {
                    pos = await this.getPosition(pos.address, symbol)
                    if (pos.debt == 0) {
                        positions.splice(i, 1);
                    } else {
                        positions[i] = pos
                    }
                }


            }

            this.positions.set(symbol, positions)
        }
    }

    private async getBnUSDBalance() : Promise<string> {
        const callBuilder = new CallBuilder();
        const call = callBuilder
            .from(this.wallet.getAddress())
            .to(this.bnUSD)
            .method("balanceOf")
            .params({
                "_owner": this.wallet.getAddress(),
            })
            .build();
        return await this.iconService.call(call).execute();
    }

    private async getPrice(symbol:string) : Promise<number> {
        const callBuilder = new CallBuilder();

        const call = callBuilder
            .from(this.wallet.getAddress())
            .to(this.oracle)
            .method("getLastPriceInUSD")
            .params({
                "symbol": symbol,
            })
            .build();
        const result = await this.iconService.call(call).execute();
        return parseInt(result, 16);
    }

    private async getCollateralTypes() : Promise<void>  {
        const callBuilder = new CallBuilder();
        const call = callBuilder
            .from(this.wallet.getAddress())
            .to(this.loans)
            .method("getCollateralTokens")
            .build();
        const result = await this.iconService.call(call).execute();
        this.collaterals = result;
    }

    private async getLiquidationRatio(symbol:string) : Promise<number> {
        const callBuilder = new CallBuilder();
        const call = callBuilder
            .from(this.wallet.getAddress())
            .to(this.loans)
            .method("getLiquidationRatio")
            .params({
                "_symbol": symbol
            })
            .build();
        const result = await this.iconService.call(call).execute();
        return result
    }

    private async getBorrowerCount(collateral:string): Promise<number>  {
        const callBuilder = new CallBuilder();
        const call = callBuilder
            .from(this.wallet.getAddress())
            .to(this.loans)
            .method("getBorrowerCount")
            .params({
                "collateralAddress": collateral
            })
            .build();

        const result = await this.iconService.call(call).execute();
        return result
    }

    public async getPosition(address:string, symbol:string): Promise<Position>  {
        const callBuilder = new CallBuilder();
        const call = callBuilder
        .from(this.wallet.getAddress())
        .to(this.loans)
            .method("getAccountPositions")
            .params({
                "_owner": address,
            })
            .build();
        const result = await this.iconService.call(call).execute();

        let debt = parseInt(result.holdings[symbol]["bnUSD"], 16);
        let collateral = parseInt(result.holdings[symbol][symbol], 16);
        let pos = {
            collateral: 0,
            debt: 0,
            liquidationPrice: 0,
            address: address
        }

        if (debt != 0) {
            let liquidationRatio =  await this.getLiquidationRatio(symbol);
            let liquidationPrice = ((((liquidationRatio * 10 ** 18) / 10000) * debt) / collateral)
                pos = {
                    collateral: collateral,
                    debt: debt,
                    liquidationPrice: liquidationPrice,
                    address: address
                }
        }
        return pos;
    }

    private async getBorrowers(collateral:string, amount:number, start:number): Promise<any>  {
        const callBuilder = new CallBuilder();
        const call = callBuilder
        .from(this.wallet.getAddress())
        .to(this.loans)
            .method("getBorrowers")
            .params({
                "collateralAddress": collateral,
                "nrOfPositions": amount.toString(),
                "startId": start.toString()
            })
            .build();
        const result = await this.iconService.call(call).execute();
        return result;
    }


    public async sync(): Promise<void> {
        await this.getCollateralTypes()
        for (const [symbol, collateral] of Object.entries(this.collaterals)) {
            let liquidationRatio =  await this.getLiquidationRatio(symbol);


            let remaining = await this.getBorrowerCount(collateral);
            let currentId = 0;
            let positions = new Array<Position>();

            while (remaining > 0) {
                const nrOfPositions = Math.min(100, remaining);
                const borrowers = await this.getBorrowers(collateral, nrOfPositions, currentId);
                remaining -= nrOfPositions;
                currentId = parseInt(borrowers[borrowers.length - 1].nextId, 16);

                for (const borrower of borrowers) {
                    let debt = parseInt(borrower.debt, 16);
                    let collateral = parseInt(borrower[symbol], 16);
                    if (debt != 0) {
                        let liquidationPrice = ((((liquidationRatio * 10 ** 18) / 10000) * debt) / collateral)
                        let pos = {
                            collateral: collateral,
                            debt: debt,
                            liquidationPrice: liquidationPrice,
                            address: borrower.address
                        }
                        positions.push(pos);
                    }
                }
            }
            positions.sort((a, b) => a.liquidationPrice - b.liquidationPrice);
            this.positions.set(symbol, positions)
        }
    }

    private async getTxResult(txHash: string): Promise<any> {
        let attempt = 0;
        let maxRetries = 10;
        while (attempt < maxRetries) {
            try {
                const result = await this.iconService.getTransactionResult(txHash).execute();
                return result; // If the function is successful, return the result
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw new Error(`Failed to resolve ${txHash}: ${error}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
            }
        }

        throw new Error(`Failed after ${attempt} attempts`);
    }
}
