import {prisma} from '../db.server';
import {createHash} from 'node:crypto';
export async function ownedDemand(shop:string,customerId:string,id:string){
 const survey=await prisma.demandSurvey.findFirst({where:{id,shop,ownerId:customerId}});
 if(!survey)throw Error('본인이 등록한 수요조사만 관리할 수 있습니다.');
 return survey;
}
export async function demandPrefill(shop:string,customerId:string,id:string){
 const survey=await ownedDemand(shop,customerId,id);
 if(survey.productId)throw Error('이미 공구 초안을 생성한 수요조사입니다. 수요조사 관리에서 확인해 주세요.');
 const total=await prisma.demandEntry.aggregate({where:{surveyId:id},_sum:{quantity:true}});
 return {id:survey.id,title:survey.title,url:survey.sourceUrl,imageUrl:survey.imageData?'':survey.imageUrl,quantity:Math.max(1,total._sum.quantity||survey.targetQuantity||1),shippingNote:survey.description,thumbnailPath:survey.imageData?'/apps/townwine-follow/demand-surveys?image='+encodeURIComponent(id):''};
}
export function demandSubmissionKey(shop:string,id:string){return createHash('sha256').update(`demand:${shop}:${id}`).digest('hex');}
